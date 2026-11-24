const router = require('express').Router();
const { pool } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth);

// Applicable (assignment, group) pairs with progress. Students see only their own groups.
async function pairs(user, assignmentId) {
  const admin = user.role === 'admin';
  const params = [];
  if (!admin) params.push(user.id);
  if (assignmentId) params.push(assignmentId);
  const sql = `
    SELECT a.id AS assignment_id, g.id AS group_id, g.name AS group_name,
      (SELECT count(*)::int FROM group_members WHERE group_id=g.id) AS total,
      (SELECT count(*)::int FROM submissions s WHERE s.assignment_id=a.id AND s.group_id=g.id) AS done,
      ${admin ? 'false' : `EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.group_id=g.id AND s.user_id=$1)`} AS mine,
      (SELECT json_agg(json_build_object('name',u.name,'email',u.email,'confirmed',
          EXISTS(SELECT 1 FROM submissions s WHERE s.assignment_id=a.id AND s.group_id=g.id AND s.user_id=u.id)) ORDER BY u.name)
        FROM group_members gm2 JOIN users u ON u.id=gm2.user_id WHERE gm2.group_id=g.id) AS members
    FROM assignments a CROSS JOIN groups g
    ${admin ? '' : 'JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=$1'}
    WHERE (a.assign_all OR EXISTS(SELECT 1 FROM assignment_groups ag WHERE ag.assignment_id=a.id AND ag.group_id=g.id))
    ${assignmentId ? `AND a.id=$${params.length}` : ''}
    ORDER BY g.name`;
  return (await pool.query(sql, params)).rows;
}

router.get('/', async (req, res) => {
  const admin = req.user.role === 'admin';
  const { rows } = await pool.query(
    `SELECT a.id, a.title, a.description, a.due_date AS "dueDate", a.onedrive_link AS "onedriveLink", a.assign_all AS "assignAll",
       COALESCE((SELECT json_agg(group_id) FROM assignment_groups WHERE assignment_id=a.id),'[]') AS "groupIds"
     FROM assignments a
     ${admin ? '' : `WHERE a.assign_all OR EXISTS(SELECT 1 FROM assignment_groups ag JOIN group_members gm ON gm.group_id=ag.group_id
         WHERE ag.assignment_id=a.id AND gm.user_id=$1)`}
     ORDER BY a.due_date`, admin ? [] : [req.user.id]);
  const p = await pairs(req.user);
  res.json(rows.map((a) => ({ ...a, groups: p.filter((x) => x.assignment_id === a.id) })));
});

async function save(req, res, id) {
  const { title, description, dueDate, onedriveLink, assignAll, groupIds = [] } = req.body;
  if (!title || !dueDate || !onedriveLink) return res.status(400).json({ error: 'Title, due date and OneDrive link are required' });
  const all = assignAll !== false;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    let aid = id;
    if (id) {
      const r = await c.query(
        `UPDATE assignments SET title=$1,description=$2,due_date=$3,onedrive_link=$4,assign_all=$5 WHERE id=$6`,
        [title, description || '', dueDate, onedriveLink, all, id]);
      if (!r.rowCount) { await c.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
      await c.query('DELETE FROM assignment_groups WHERE assignment_id=$1', [id]);
    } else {
      const r = await c.query(
        `INSERT INTO assignments (title,description,due_date,onedrive_link,assign_all,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [title, description || '', dueDate, onedriveLink, all, req.user.id]);
      aid = r.rows[0].id;
    }
    if (!all) for (const g of groupIds)
      await c.query('INSERT INTO assignment_groups VALUES ($1,$2) ON CONFLICT DO NOTHING', [aid, g]);
    await c.query('COMMIT');
    res.status(id ? 200 : 201).json({ id: aid });
  } catch { await c.query('ROLLBACK'); res.status(500).json({ error: 'Could not save assignment' }); }
  finally { c.release(); }
}
router.post('/', requireRole('admin'), (req, res) => save(req, res));
router.put('/:id', requireRole('admin'), (req, res) => save(req, res, +req.params.id));
router.delete('/:id', requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM assignments WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Student confirms submission for their group. Body must contain confirm:true (second verification step).
router.post('/:id/confirm', requireRole('student'), async (req, res) => {
  const { groupId, confirm } = req.body;
  if (confirm !== true) return res.status(400).json({ error: 'Confirmation required' });
  const ok = (await pairs(req.user, +req.params.id)).find((p) => p.group_id === +groupId);
  if (!ok) return res.status(403).json({ error: 'This assignment is not assigned to your group' });
  await pool.query(
    'INSERT INTO submissions (assignment_id,group_id,user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [req.params.id, groupId, req.user.id]);
  res.status(201).json({ ok: true });
});

// Admin analytics: completion per assignment (group counts + student confirmations).
router.get('/analytics/summary', requireRole('admin'), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT a.id, a.title,
      COUNT(g.id)::int AS groups,
      COUNT(g.id) FILTER (WHERE t.total>0 AND t.done=t.total)::int AS "groupsComplete",
      COALESCE(SUM(t.total),0)::int AS students,
      COALESCE(SUM(t.done),0)::int AS confirmed
    FROM assignments a
    LEFT JOIN groups g ON a.assign_all OR EXISTS(SELECT 1 FROM assignment_groups ag WHERE ag.assignment_id=a.id AND ag.group_id=g.id)
    LEFT JOIN LATERAL (SELECT (SELECT count(*) FROM group_members WHERE group_id=g.id) AS total,
        (SELECT count(*) FROM submissions s WHERE s.assignment_id=a.id AND s.group_id=g.id) AS done) t ON true
    GROUP BY a.id ORDER BY a.due_date`);
  res.json(rows);
});

module.exports = router;
