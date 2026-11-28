CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  student_id TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- A course is taught by one professor; students enrol with its join code.
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  join_code TEXT UNIQUE NOT NULL,
  professor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS enrollments (
  course_id INT REFERENCES courses(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, user_id)
);

-- Groups live inside one course. The student who creates a group is its leader.
CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  leader_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- course_id is repeated here so "one group per student per course" is a plain UNIQUE constraint.
CREATE TABLE IF NOT EXISTS group_members (
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id),
  UNIQUE (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TIMESTAMPTZ NOT NULL,
  onedrive_link TEXT NOT NULL,
  submission_type TEXT NOT NULL DEFAULT 'individual' CHECK (submission_type IN ('individual','group')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- One row = one acknowledgement.
--   individual assignment: group_id IS NULL, user_id is the student.
--   group assignment: group_id is set, user_id is the leader who acknowledged for everyone.
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  group_id INT REFERENCES groups(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_individual ON submissions (assignment_id, user_id) WHERE group_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_group ON submissions (assignment_id, group_id) WHERE group_id IS NOT NULL;

-- Lookups the API and the views below rely on.
CREATE INDEX IF NOT EXISTS enrollments_user ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS group_members_user ON group_members (user_id);
CREATE INDEX IF NOT EXISTS groups_course ON groups (course_id);
CREATE INDEX IF NOT EXISTS assignments_course ON assignments (course_id);
CREATE INDEX IF NOT EXISTS submissions_assignment ON submissions (assignment_id);

-- Student record: profile plus the courses they are enrolled in.
CREATE OR REPLACE VIEW students AS
SELECT u.id, u.name, u.email, u.student_id,
  COALESCE((SELECT json_agg(json_build_object('courseId', c.id, 'code', c.code, 'title', c.title) ORDER BY c.code)
            FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = u.id), '[]') AS enrolled_courses
FROM users u WHERE u.role = 'student';

-- Professor record: profile plus the courses they teach.
CREATE OR REPLACE VIEW professors AS
SELECT u.id, u.name, u.email,
  COALESCE((SELECT json_agg(json_build_object('courseId', c.id, 'code', c.code, 'title', c.title) ORDER BY c.code)
            FROM courses c WHERE c.professor_id = u.id), '[]') AS courses_taught
FROM users u WHERE u.role = 'admin';

-- Submission status of every assignment for every enrolled student.
-- Group work: the status is read from the group's single submission row, so all members always agree.
CREATE OR REPLACE VIEW assignment_student_status AS
SELECT a.id AS assignment_id, a.course_id, e.user_id AS student_id, a.submission_type,
  g.id AS group_id, g.leader_id, s.user_id AS acknowledged_by, s.acknowledged_at,
  CASE WHEN a.submission_type = 'group' AND g.id IS NULL THEN 'no_group'
       WHEN s.id IS NOT NULL THEN 'acknowledged'
       WHEN a.due_date < now() THEN 'overdue'
       ELSE 'pending' END AS status
FROM assignments a
JOIN enrollments e ON e.course_id = a.course_id
LEFT JOIN group_members gm ON a.submission_type = 'group' AND gm.course_id = a.course_id AND gm.user_id = e.user_id
LEFT JOIN groups g ON g.id = gm.group_id
LEFT JOIN submissions s ON s.assignment_id = a.id AND (
  (a.submission_type = 'individual' AND s.group_id IS NULL AND s.user_id = e.user_id)
  OR (a.submission_type = 'group' AND s.group_id = g.id));

-- ===== Data relationships: rules the database enforces itself, whatever the API does =====
-- Added idempotently, so existing databases pick them up on the next start.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS members_at_ack INT;

DO $$
BEGIN
  -- A group and its memberships always belong to the same course.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_id_course_unique') THEN
    ALTER TABLE groups ADD CONSTRAINT groups_id_course_unique UNIQUE (id, course_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_members_group_course_fk') THEN
    ALTER TABLE group_members ADD CONSTRAINT group_members_group_course_fk
      FOREIGN KEY (group_id, course_id) REFERENCES groups (id, course_id) ON DELETE CASCADE;
  END IF;
  -- Only enrolled students can be in a group. Un-enrolling a student removes them from the group.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_members_enrolled_fk') THEN
    ALTER TABLE group_members ADD CONSTRAINT group_members_enrolled_fk
      FOREIGN KEY (course_id, user_id) REFERENCES enrollments (course_id, user_id) ON DELETE CASCADE;
  END IF;
  -- The leader is always a member of their own group. Checked at commit, so a group and its
  -- first member can be inserted in one transaction.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_leader_is_member_fk') THEN
    ALTER TABLE groups ADD CONSTRAINT groups_leader_is_member_fk
      FOREIGN KEY (id, leader_id) REFERENCES group_members (group_id, user_id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Every acknowledgement must be valid for its assignment:
--   group assignment      -> a group of the same course, acknowledged by that group's current leader
--   individual assignment -> no group, acknowledged by a student enrolled in the course
CREATE OR REPLACE FUNCTION check_submission() RETURNS trigger AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT course_id, submission_type INTO a FROM assignments WHERE id = NEW.assignment_id;
  IF a.submission_type = 'group' THEN
    IF NEW.group_id IS NULL THEN
      RAISE EXCEPTION 'A group assignment must be acknowledged for a group' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM groups WHERE id = NEW.group_id AND course_id = a.course_id AND leader_id = NEW.user_id) THEN
      RAISE EXCEPTION 'Only the leader of a group in this course can acknowledge a group assignment' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.group_id IS NOT NULL THEN
      RAISE EXCEPTION 'An individual assignment cannot be acknowledged by a group' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = a.course_id AND user_id = NEW.user_id) THEN
      RAISE EXCEPTION 'Only students enrolled in the course can acknowledge an assignment' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS submissions_check ON submissions;
CREATE TRIGGER submissions_check BEFORE INSERT ON submissions
  FOR EACH ROW EXECUTE FUNCTION check_submission();
