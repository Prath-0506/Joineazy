const { pool } = require('../db');

// Express 4 does not catch rejected promises, so every async handler goes through h().
exports.h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Parse a positive integer id, or null.
exports.toId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

exports.isEnrolled = async (userId, courseId) =>
  (await pool.query('SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2', [userId, courseId])).rowCount > 0;

exports.ownsCourse = async (userId, courseId) =>
  (await pool.query('SELECT 1 FROM courses WHERE id=$1 AND professor_id=$2', [courseId, userId])).rowCount > 0;
