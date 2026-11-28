const router = require('express').Router();
const { pool } = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { h, toId, isEnrolled } = require('../middleware/util');

router.use(auth, requireRole('student'));

// Create a group inside a course. The creator becomes the leader.
router.post('/', h(async (req, res) => {
  const name = (req.body.name || '').trim();
  const courseId = toId(req.body.courseId);
  if (!name || !courseId) return res.status(400).json({ error: 'Group name and course are required' });
  if (!(await isEnrolled(req.user.id, courseId))) return res.status(403).json({ error: 'You are not enrolled in this course' });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows } = await c.query('INSERT INTO groups (course_id,name,leader_id) VALUES ($1,$2,$3) RETURNING id', [courseId, name, req.user.id]);
    await c.query('INSERT INTO group_members (group_id,user_id,course_id) VALUES ($1,$2,$3)', [rows[0].id, req.user.id, courseId]);
    await c.query('COMMIT');
    res.status(201).json({ id: rows[0].id });
  } catch (e) {
    await c.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'You are already in a group for this course' });
    throw e;
  } finally { c.release(); }
}));

// Acknowledgements already recorded for a group. Group coverage is derived from the group's row,
// so these are exactly the assignments a member who joins is covered by, and a member who leaves loses.
const standing = async (groupId) =>
  (await pool.query('SELECT count(*)::int AS n FROM submissions WHERE group_id=$1', [groupId])).rows[0].n;

async function leaderGroup(req, res) {
  const id = toId(req.params.id);
  const g = id && (await pool.query('SELECT * FROM groups WHERE id=$1', [id])).rows[0];
  if (!g) { res.status(404).json({ error: 'Group not found' }); return null; }
  if (g.leader_id !== req.user.id) { res.status(403).json({ error: 'Only the group leader can change the group' }); return null; }
  return g;
}

// Leader adds a classmate by email or student ID. They must be enrolled and not yet in a group.
router.post('/:id/members', h(async (req, res) => {
  const g = await leaderGroup(req, res);
  if (!g) return;
  const who = (req.body.identifier || '').trim().toLowerCase();
  const u = await pool.query(
    `SELECT u.id FROM users u JOIN enrollments e ON e.user_id=u.id AND e.course_id=$2
     WHERE u.role='student' AND (lower(u.email)=$1 OR lower(u.student_id)=$1)`, [who, g.course_id]);
  if (!u.rowCount) return res.status(404).json({ error: 'No student in this course matches that email or ID' });
  try {
    await pool.query('INSERT INTO group_members (group_id,user_id,course_id) VALUES ($1,$2,$3)', [g.id, u.rows[0].id, g.course_id]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That student is already in a group for this course' });
    throw e;
  }
  res.status(201).json({ ok: true, covered: await standing(g.id) });
}));

router.delete('/:id/members/:userId', h(async (req, res) => {
  const g = await leaderGroup(req, res);
  if (!g) return;
  const uid = toId(req.params.userId);
  if (uid === g.leader_id) return res.status(400).json({ error: 'The leader cannot be removed from the group' });
  const r = await pool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [g.id, uid]);
  if (!r.rowCount) return res.status(404).json({ error: 'That student is not in this group' });
  res.json({ ok: true, covered: await standing(g.id) });
}));

// Hand leadership to another member. Past acknowledgements stay credited to whoever made them.
router.post('/:id/leader', h(async (req, res) => {
  const g = await leaderGroup(req, res);
  if (!g) return;
  const uid = toId(req.body.userId);
  if (!uid || uid === g.leader_id) return res.status(400).json({ error: 'Choose another member to make leader' });
  const m = await pool.query('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [g.id, uid]);
  if (!m.rowCount) return res.status(400).json({ error: 'Only a member of the group can become leader' });
  await pool.query('UPDATE groups SET leader_id=$1 WHERE id=$2', [uid, g.id]);
  res.json({ ok: true });
}));

// Leave a group. The leader must hand over leadership first; a leader who is alone dissolves the
// group, which is refused once it has acknowledged anything (that would erase the record).
router.post('/:id/leave', h(async (req, res) => {
  const id = toId(req.params.id);
  const g = id && (await pool.query('SELECT * FROM groups WHERE id=$1', [id])).rows[0];
  const mine = g && (await pool.query('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [id, req.user.id])).rowCount;
  if (!mine) return res.status(404).json({ error: 'You are not in this group' });
  const members = (await pool.query('SELECT count(*)::int AS n FROM group_members WHERE group_id=$1', [id])).rows[0].n;
  if (g.leader_id === req.user.id) {
    if (members > 1) return res.status(409).json({ error: 'Make another member the leader before you leave' });
    if (await standing(id)) return res.status(409).json({ error: 'This group has acknowledged submissions, so it cannot be dissolved' });
    await pool.query('DELETE FROM groups WHERE id=$1', [id]);
    return res.json({ ok: true, dissolved: true });
  }
  await pool.query('DELETE FROM group_members WHERE group_id=$1 AND user_id=$2', [id, req.user.id]);
  res.json({ ok: true, covered: await standing(id) });
}));

module.exports = router;
