const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { h, toId, isEnrolled, ownsCourse } = require('../middleware/util');

router.use(auth);

// SQL fragment: has student `u` acknowledged assignment `a`?
// Individual: their own row. Group: the row for the group they belong to.
const ackedBy = (a, u) => `(
  (${a}.submission_type='individual' AND EXISTS (SELECT 1 FROM submissions s
     WHERE s.assignment_id=${a}.id AND s.group_id IS NULL AND s.user_id=${u}))
  OR (${a}.submission_type='group' AND EXISTS (SELECT 1 FROM submissions s
     JOIN group_members gm ON gm.group_id=s.group_id AND gm.user_id=${u}
     WHERE s.assignment_id=${a}.id)))`;

const STUDENT_COURSES = `
  SELECT c.id, c.code, c.title, c.description, p.name AS professor,
    (SELECT count(*)::int FROM assignments a WHERE a.course_id=c.id) AS total,
    (SELECT count(*)::int FROM assignments a WHERE a.course_id=c.id AND ${ackedBy('a', '$1')}) AS done,
    (SELECT count(*)::int FROM assignments a WHERE a.course_id=c.id AND a.due_date < now()
       AND NOT ${ackedBy('a', '$1')}) AS overdue,
    (SELECT min(a.due_date) FROM assignments a WHERE a.course_id=c.id AND a.due_date >= now()
       AND NOT ${ackedBy('a', '$1')}) AS "nextDue"
  FROM enrollments e
  JOIN courses c ON c.id=e.course_id
  JOIN users p ON p.id=c.professor_id
  WHERE e.user_id=$1 ORDER BY c.code`;

// "expected" counts one unit per student for individual work and one per group for group work.
const PROFESSOR_COURSES = `
  SELECT c.id, c.code, c.title, c.description, c.join_code AS "joinCode",
    (SELECT count(*)::int FROM enrollments e WHERE e.course_id=c.id) AS students,
    (SELECT count(*)::int FROM groups g WHERE g.course_id=c.id) AS groups,
    count(x.id)::int AS assignments,
    COALESCE(sum(x.expected), 0)::int AS expected,
    COALESCE(sum(x.acked), 0)::int AS acknowledged,
    COALESCE(sum(CASE WHEN x.due_date < now() THEN GREATEST(x.expected - x.acked, 0) ELSE 0 END), 0)::int AS overdue
  FROM courses c
  LEFT JOIN LATERAL (
    SELECT a.id, a.due_date,
      CASE WHEN a.submission_type='individual'
           THEN (SELECT count(*) FROM enrollments e WHERE e.course_id=c.id)
           ELSE (SELECT count(*) FROM groups g WHERE g.course_id=c.id) END AS expected,
      (SELECT count(*) FROM submissions s WHERE s.assignment_id=a.id) AS acked
    FROM assignments a WHERE a.course_id=c.id
  ) x ON true
  WHERE c.professor_id=$1
  GROUP BY c.id ORDER BY c.code`;

router.get('/', h(async (req, res) => {
  const admin = req.user.role === 'admin';
  const { rows } = await pool.query(admin ? PROFESSOR_COURSES : STUDENT_COURSES, [req.user.id]);
  res.json(rows);
}));

// Professor: distinct students across all of their courses.
router.get('/summary', requireRole('admin'), h(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT count(DISTINCT e.user_id)::int AS students FROM enrollments e
     JOIN courses c ON c.id=e.course_id WHERE c.professor_id=$1`, [req.user.id]);
  res.json(rows[0]);
}));

router.post('/', requireRole('admin'), h(async (req, res) => {
  const code = (req.body.code || '').trim();
  const title = (req.body.title || '').trim();
  if (!code || !title) return res.status(400).json({ error: 'Course code and title are required' });
  for (let i = 0; i < 5; i++) {
    const joinCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    try {
      const { rows } = await pool.query(
        `INSERT INTO courses (code,title,description,join_code,professor_id) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [code, title, (req.body.description || '').trim(), joinCode, req.user.id]);
      return res.status(201).json({ id: rows[0].id, joinCode });
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  res.status(500).json({ error: 'Could not generate a join code, try again' });
}));

router.post('/join', requireRole('student'), h(async (req, res) => {
  const code = (req.body.joinCode || '').trim().toUpperCase();
  const c = await pool.query('SELECT id FROM courses WHERE join_code=$1', [code]);
  if (!c.rowCount) return res.status(404).json({ error: 'No course matches that join code' });
  const r = await pool.query('INSERT INTO enrollments (course_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [c.rows[0].id, req.user.id]);
  if (!r.rowCount) return res.status(409).json({ error: 'You are already enrolled in this course' });
  res.status(201).json({ id: c.rows[0].id });
}));

router.get('/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  const admin = req.user.role === 'admin';
  if (!(admin ? await ownsCourse(req.user.id, id) : await isEnrolled(req.user.id, id)))
    return res.status(403).json({ error: 'You do not have access to this course' });
  const { rows } = await pool.query(
    `SELECT c.id, c.code, c.title, c.description, p.name AS professor,
       ${admin ? 'c.join_code' : 'NULL'} AS "joinCode"
     FROM courses c JOIN users p ON p.id=c.professor_id WHERE c.id=$1`, [id]);
  res.json(rows[0]);
}));

module.exports = router;
