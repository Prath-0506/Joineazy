const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { auth } = require('../middleware/auth');

const sign = (u) =>
  jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '1d' });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, studentId: u.student_id, role: u.role });

// Self-registration creates students only. The admin is seeded from env vars.
router.post('/register', async (req, res) => {
  const { name, email, studentId, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name,email,student_id,password_hash) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, email.toLowerCase(), studentId || null, hash]);
    res.status(201).json({ token: sign(rows[0]), user: pub(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or student ID already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u), user: pub(u) });
});

router.get('/me', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  rows[0] ? res.json(pub(rows[0])) : res.status(404).json({ error: 'User not found' });
});

module.exports = router;
