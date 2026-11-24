const router = require('express').Router();
const { pool } = require('../db');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth);

const MEMBERS = `(SELECT json_agg(json_build_object('id',u.id,'name',u.name,'email',u.email,'studentId',u.student_id) ORDER BY u.name)
  FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=g.id) AS members`;

// Student: my groups. Admin: all groups.
router.get('/', async (req, res) => {
  const admin = req.user.role === 'admin';
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.created_by, ${MEMBERS} FROM groups g
     ${admin ? '' : 'JOIN group_members m ON m.group_id=g.id AND m.user_id=$1'} ORDER BY g.id DESC`,
    admin ? [] : [req.user.id]);
  res.json(rows);
});

router.post('/', requireRole('student'), async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name is required' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query('INSERT INTO groups (name,created_by) VALUES ($1,$2) RETURNING *', [name, req.user.id]);
    await c.query('INSERT INTO group_members VALUES ($1,$2)', [rows[0].id, req.user.id]);
    await c.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch { await c.query('ROLLBACK'); res.status(500).json({ error: 'Could not create group' }); }
  finally { c.release(); }
});

// Add a member by student email or student ID. Any current member may add.
router.post('/:id/members', requireRole('student'), async (req, res) => {
  const id = (req.body.identifier || '').trim().toLowerCase();
  const isMember = await pool.query('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!isMember.rowCount) return res.status(403).json({ error: 'You are not in this group' });
  const u = await pool.query(`SELECT id FROM users WHERE role='student' AND (lower(email)=$1 OR lower(student_id)=$1)`, [id]);
  if (!u.rowCount) return res.status(404).json({ error: 'No student found with that email or ID' });
  const r = await pool.query('INSERT INTO group_members VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, u.rows[0].id]);
  if (!r.rowCount) return res.status(409).json({ error: 'Already a member' });
  res.status(201).json({ ok: true });
});

module.exports = router;
