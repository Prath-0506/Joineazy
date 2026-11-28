const router = require('express').Router();
const { pool } = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { h, toId, isEnrolled, ownsCourse } = require('../middleware/util');

router.use(auth);

const COLS = `a.id, a.course_id AS "courseId", a.title, a.description, a.due_date AS "dueDate",
  a.onedrive_link AS "onedriveLink", a.submission_type AS "submissionType"`;

// ---------- student view ----------
// One row per assignment with this student's status. For group work the status comes from the
// group's single submission row, so every member sees what the leader did.
async function studentRows(uid, courseId, assignmentId) {
  const params = [uid, courseId];
  if (assignmentId) params.push(assignmentId);
  const { rows } = await pool.query(
    `SELECT ${COLS}, g.id AS "groupId", g.name AS "groupName", g.leader_id AS "leaderId",
       s.acknowledged_at AS "acknowledgedAt", su.name AS "acknowledgedBy", s.members_at_ack AS "membersAtAck"
     FROM assignments a
     LEFT JOIN group_members gm ON a.submission_type='group' AND gm.course_id=a.course_id AND gm.user_id=$1
     LEFT JOIN groups g ON g.id=gm.group_id
     LEFT JOIN submissions s ON s.assignment_id=a.id AND (
       (a.submission_type='individual' AND s.group_id IS NULL AND s.user_id=$1)
       OR (a.submission_type='group' AND s.group_id=g.id))
     LEFT JOIN users su ON su.id=s.user_id
     WHERE a.course_id=$2 ${assignmentId ? 'AND a.id=$3' : ''}
     ORDER BY a.due_date, a.id`, params);
  return rows.map((r) => ({
    id: r.id, courseId: r.courseId, title: r.title, description: r.description, dueDate: r.dueDate,
    onedriveLink: r.onedriveLink, submissionType: r.submissionType,
    status: r.submissionType === 'group' && !r.groupId ? 'no_group' : r.acknowledgedAt ? 'acknowledged' : 'pending',
    acknowledgedAt: r.acknowledgedAt, acknowledgedBy: r.acknowledgedBy, membersAtAck: r.membersAtAck,
    late: !!r.acknowledgedAt && new Date(r.acknowledgedAt) > new Date(r.dueDate),
    group: r.groupId ? { id: r.groupId, name: r.groupName, leaderId: r.leaderId } : null,
    isLeader: r.leaderId === uid,
  }));
}

// ---------- professor view ----------
async function professorRows(courseId, assignmentId) {
  const params = [courseId];
  if (assignmentId) params.push(assignmentId);
  const { rows } = await pool.query(
    `SELECT ${COLS},
       CASE WHEN a.submission_type='individual'
            THEN (SELECT count(*) FROM enrollments e WHERE e.course_id=a.course_id)
            ELSE (SELECT count(*) FROM groups g WHERE g.course_id=a.course_id) END::int AS expected,
       (SELECT count(*) FROM submissions s WHERE s.assignment_id=a.id)::int AS acknowledged
     FROM assignments a WHERE a.course_id=$1 ${assignmentId ? 'AND a.id=$2' : ''}
     ORDER BY a.due_date, a.id`, params);
  return rows;
}

async function roster(a) {
  if (a.submissionType === 'individual') {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.student_id AS "studentId", v.acknowledged_at AS "acknowledgedAt"
       FROM assignment_student_status v JOIN users u ON u.id=v.student_id
       WHERE v.assignment_id=$1 ORDER BY u.name`, [a.id]);
    return { students: rows };
  }
  const groups = await pool.query(
    `SELECT g.id, g.name, lu.name AS leader, s.acknowledged_at AS "acknowledgedAt", su.name AS "acknowledgedBy", s.members_at_ack AS "membersAtAck",
       (SELECT json_agg(u.name ORDER BY u.name) FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=g.id) AS members
     FROM groups g JOIN users lu ON lu.id=g.leader_id
     LEFT JOIN submissions s ON s.assignment_id=$1 AND s.group_id=g.id
     LEFT JOIN users su ON su.id=s.user_id
     WHERE g.course_id=$2 ORDER BY g.name`, [a.id, a.courseId]);
  const ungrouped = await pool.query(
    `SELECT u.name FROM enrollments e JOIN users u ON u.id=e.user_id
     WHERE e.course_id=$1 AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.course_id=$1 AND gm.user_id=u.id)
     ORDER BY u.name`, [a.courseId]);
  return { groups: groups.rows, ungrouped: ungrouped.rows.map((r) => r.name) };
}

// ---------- routes ----------
router.get('/', h(async (req, res) => {
  const courseId = toId(req.query.courseId);
  if (!courseId) return res.status(400).json({ error: 'courseId is required' });
  if (req.user.role === 'admin') {
    if (!(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Not your course' });
    return res.json(await professorRows(courseId));
  }
  if (!(await isEnrolled(req.user.id, courseId))) return res.status(403).json({ error: 'You are not enrolled in this course' });
  res.json(await studentRows(req.user.id, courseId));
}));

router.get('/:id', h(async (req, res) => {
  const id = toId(req.params.id);
  const found = id && (await pool.query('SELECT course_id FROM assignments WHERE id=$1', [id])).rows[0];
  if (!found) return res.status(404).json({ error: 'Assignment not found' });
  const courseId = found.course_id;

  if (req.user.role === 'admin') {
    if (!(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Not your course' });
    const [a] = await professorRows(courseId, id);
    return res.json({ ...a, ...(await roster(a)) });
  }
  if (!(await isEnrolled(req.user.id, courseId))) return res.status(403).json({ error: 'You are not enrolled in this course' });
  const [a] = await studentRows(req.user.id, courseId, id);
  if (a.group) {
    const m = await pool.query(
      `SELECT u.id, u.name, u.email, u.student_id AS "studentId" FROM group_members gm
       JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 ORDER BY u.name`, [a.group.id]);
    a.group.members = m.rows;
  }
  res.json(a);
}));

async function save(req, res, id) {
  const { title, description, dueDate, onedriveLink } = req.body;
  const type = req.body.submissionType || 'individual';
  if (!title || !dueDate || !onedriveLink) return res.status(400).json({ error: 'Title, deadline and OneDrive link are required' });
  if (!['individual', 'group'].includes(type)) return res.status(400).json({ error: 'Submission type must be individual or group' });

  if (id) {
    const cur = (await pool.query('SELECT course_id, submission_type FROM assignments WHERE id=$1', [id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'Assignment not found' });
    if (!(await ownsCourse(req.user.id, cur.course_id))) return res.status(403).json({ error: 'Not your course' });
    if (cur.submission_type !== type && (await pool.query('SELECT 1 FROM submissions WHERE assignment_id=$1', [id])).rowCount)
      return res.status(409).json({ error: 'Submission type cannot change after students have acknowledged' });
    await pool.query(
      `UPDATE assignments SET title=$1, description=$2, due_date=$3, onedrive_link=$4, submission_type=$5 WHERE id=$6`,
      [title, description || '', dueDate, onedriveLink, type, id]);
    return res.json({ id });
  }
  const courseId = toId(req.body.courseId);
  if (!courseId || !(await ownsCourse(req.user.id, courseId))) return res.status(403).json({ error: 'Not your course' });
  const { rows } = await pool.query(
    `INSERT INTO assignments (course_id,title,description,due_date,onedrive_link,submission_type)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [courseId, title, description || '', dueDate, onedriveLink, type]);
  res.status(201).json({ id: rows[0].id });
}
router.post('/', requireRole('admin'), h((req, res) => save(req, res)));
router.put('/:id', requireRole('admin'), h((req, res) => {
  const id = toId(req.params.id);
  return id ? save(req, res, id) : res.status(400).json({ error: 'Invalid id' });
}));

router.delete('/:id', requireRole('admin'), h(async (req, res) => {
  const id = toId(req.params.id);
  const r = await pool.query(
    `DELETE FROM assignments a USING courses c WHERE a.id=$1 AND c.id=a.course_id AND c.professor_id=$2`, [id, req.user.id]);
  if (!r.rowCount) return res.status(404).json({ error: 'Assignment not found' });
  res.json({ ok: true });
}));

// Acknowledge a submission. The client asks twice; the body must still carry confirm:true.
//   individual: records the student's own acknowledgement.
//   group: only the group leader may do this, and it covers every member through the group's row.
router.post('/:id/acknowledge', requireRole('student'), h(async (req, res) => {
  if (req.body.confirm !== true) return res.status(400).json({ error: 'Confirmation required' });
  const id = toId(req.params.id);
  const a = id && (await pool.query('SELECT id, course_id, submission_type FROM assignments WHERE id=$1', [id])).rows[0];
  if (!a || !(await isEnrolled(req.user.id, a.course_id))) return res.status(404).json({ error: 'Assignment not found' });

  if (a.submission_type === 'individual') {
    await pool.query('INSERT INTO submissions (assignment_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [a.id, req.user.id]);
    return res.status(201).json({ ok: true });
  }
  const g = (await pool.query(
    `SELECT g.id, g.leader_id FROM groups g JOIN group_members gm ON gm.group_id=g.id
     WHERE g.course_id=$1 AND gm.user_id=$2`, [a.course_id, req.user.id])).rows[0];
  if (!g) return res.status(409).json({ error: 'Create or join a group for this course first' });
  if (g.leader_id !== req.user.id) return res.status(403).json({ error: 'Only the group leader can acknowledge a group submission' });
  await pool.query(`INSERT INTO submissions (assignment_id,group_id,user_id,members_at_ack)
     VALUES ($1,$2,$3,(SELECT count(*)::int FROM group_members WHERE group_id=$2)) ON CONFLICT DO NOTHING`, [a.id, g.id, req.user.id]);
  res.status(201).json({ ok: true });
}));

module.exports = router;
