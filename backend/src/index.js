require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { init } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (_q, r) => r.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/assignments', require('./routes/assignments'));

// Any error thrown inside a route lands here instead of crashing the process.
app.use((err, _req, res, _next) => {
  if (err.code === '22P02') return res.status(400).json({ error: 'Invalid id' });
  if (err.code === '23514') return res.status(400).json({ error: err.message }); // rule raised by a database trigger
  if (err.code === '23503') return res.status(409).json({ error: 'That change conflicts with related records' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

init()
  .then(() => app.listen(process.env.PORT || 5000, () => console.log('API running')))
  .catch((e) => { console.error(e); process.exit(1); });
