const bcrypt = require('bcryptjs');

// Demo data so both dashboards have something to show. Runs only when SEED_DEMO=true and no courses exist.
// Students all use the password "student123".
module.exports = async function seed(pool) {
  const prof = (await pool.query(`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`)).rows[0];
  if (!prof || (await pool.query('SELECT 1 FROM courses LIMIT 1')).rowCount) return;

  const hash = await bcrypt.hash('student123', 10);
  const people = [['aarav', 'Aarav Mehta', 'S1001'], ['diya', 'Diya Nair', 'S1002'], ['kabir', 'Kabir Rao', 'S1003'],
                  ['meera', 'Meera Iyer', 'S1004'], ['rohan', 'Rohan Das', 'S1005']];
  const u = {};
  for (const [key, name, sid] of people) {
    const r = await pool.query(
      `INSERT INTO users (name,email,student_id,password_hash) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [name, `${key}@joineazy.com`, sid, hash]);
    u[key] = r.rows[0].id;
  }

  const course = async (code, title, description, join) =>
    (await pool.query('INSERT INTO courses (code,title,description,join_code,professor_id) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [code, title, description, join, prof.id])).rows[0].id;
  const web = await course('CS301', 'Web Engineering', 'Design, build and ship full-stack web applications.', 'WEB301');
  const db = await course('CS204', 'Database Systems', 'Relational modelling, SQL and query planning.', 'DB2040');
  const math = await course('MA210', 'Discrete Mathematics', 'Logic, proofs, graphs and counting.', 'MATH21');

  const enrol = async (c, keys) => { for (const k of keys) await pool.query('INSERT INTO enrollments (course_id,user_id) VALUES ($1,$2)', [c, u[k]]); };
  await enrol(web, ['aarav', 'diya', 'kabir', 'meera', 'rohan']);
  await enrol(db, ['aarav', 'diya', 'kabir', 'meera']);
  await enrol(math, ['aarav', 'rohan']);

  const group = async (c, name, leader, others) => {
    const cl = await pool.connect();
    try {
      await cl.query('BEGIN'); // the leader-is-a-member rule is checked at commit
      const g = (await cl.query('INSERT INTO groups (course_id,name,leader_id) VALUES ($1,$2,$3) RETURNING id', [c, name, u[leader]])).rows[0].id;
      for (const k of [leader, ...others])
        await cl.query('INSERT INTO group_members (group_id,user_id,course_id) VALUES ($1,$2,$3)', [g, u[k], c]);
      await cl.query('COMMIT');
      return g;
    } catch (e) { await cl.query('ROLLBACK'); throw e; } finally { cl.release(); }
  };
  const orbit = await group(web, 'Team Orbit', 'aarav', ['diya', 'kabir']);
  const vega = await group(web, 'Team Vega', 'meera', ['rohan']);

  const days = (n) => new Date(Date.now() + n * 864e5);
  const assignment = async (c, title, description, due, type) =>
    (await pool.query(
      `INSERT INTO assignments (course_id,title,description,due_date,onedrive_link,submission_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [c, title, description, due, `https://onedrive.live.com/?demo=${encodeURIComponent(title)}`, type])).rows[0].id;

  const proposal = await assignment(web, 'Project proposal', 'One-page proposal with problem statement, scope and a feature list. Upload a single PDF to the shared folder.', days(5), 'group');
  const apiQuiz = await assignment(web, 'API design reflection', 'Write 500 words on the REST design choices in your last project and what you would change.', days(2), 'individual');
  const sprint = await assignment(web, 'Sprint 1 demo', 'Record a five minute walkthrough of your working prototype.', days(-1), 'group');
  await assignment(db, 'ER diagram', 'Model the library system from the case study and export the diagram as PNG.', days(7), 'individual');
  const norm = await assignment(db, 'Normalisation worksheet', 'Take the supplied tables to 3NF and justify each step.', days(-3), 'individual');
  await assignment(math, 'Proof set 3', 'Induction and contradiction proofs, problems 1 to 8.', days(3), 'individual');

  const ackInd = (a, k, at) => pool.query('INSERT INTO submissions (assignment_id,user_id,acknowledged_at) VALUES ($1,$2,$3)', [a, u[k], at]);
  const ackGrp = (a, g, k, at) => pool.query('INSERT INTO submissions (assignment_id,group_id,user_id,acknowledged_at,members_at_ack) VALUES ($1,$2,$3,$4,(SELECT count(*)::int FROM group_members WHERE group_id=$2))', [a, g, u[k], at]);
  await ackGrp(sprint, vega, 'meera', days(-1.2));
  await ackGrp(proposal, vega, 'meera', days(-0.1));
  await ackInd(norm, 'aarav', days(-3.5));
  await ackInd(norm, 'diya', days(-2));
  await ackInd(apiQuiz, 'kabir', days(-0.3));
  console.log('Demo data seeded');
};
