import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Progress from '../components/Progress.jsx';
import Badge from '../components/Badge.jsx';
import { accent } from '../utils';

function CourseCard({ c }) {
  const pending = Math.max(c.expected - c.acknowledged - c.overdue, 0);
  return (
    <a href={`#/courses/${c.id}`}
      className="panel group flex flex-col gap-3 border-t-4 transition-shadow hover:shadow-md"
      style={{ borderTopColor: accent(c.code) }}>
      <div>
        <span className="chip" style={{ color: accent(c.code), borderColor: accent(c.code) }}>{c.code}</span>
        <h3 className="mt-2 font-display text-xl leading-snug group-hover:underline">{c.title}</h3>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-ink/70">Students</dt><dd className="text-lg font-semibold">{c.students}</dd></div>
        <div><dt className="text-xs text-ink/70">Assignments</dt><dd className="text-lg font-semibold">{c.assignments}</dd></div>
        <div><dt className="text-xs text-ink/70">Groups</dt><dd className="text-lg font-semibold">{c.groups}</dd></div>
      </dl>
      {c.expected > 0
        ? <>
            <Progress done={c.acknowledged} total={c.expected} overdue={c.overdue} label={`${c.acknowledged} of ${c.expected} submissions acknowledged`} />
            <div className="flex flex-wrap gap-2">
              {c.acknowledged >= c.expected && <Badge kind="complete">All acknowledged</Badge>}
              {pending > 0 && <Badge kind="pending">{pending} pending</Badge>}
              {c.overdue > 0 && <Badge kind="overdue">{c.overdue} overdue</Badge>}
            </div>
          </>
        : <p className="text-sm text-ink/70">{c.assignments ? 'Waiting for students to enrol.' : 'No assignments yet.'}</p>}
      <p className="mt-auto text-xs text-ink/70">Join code <span className="font-mono font-semibold text-ink">{c.joinCode}</span></p>
    </a>
  );
}

export default function ProfessorDashboard() {
  const [courses, setCourses] = useState(null);
  const [students, setStudents] = useState(0);
  const [form, setForm] = useState({ code: '', title: '', description: '' });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api('/courses'), api('/courses/summary')]);
      setCourses(c); setStudents(s.students);
    } catch (e) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const create = async (e) => {
    e.preventDefault(); setMsg('');
    try { await api('/courses', { method: 'POST', body: form }); setForm({ code: '', title: '', description: '' }); setAdding(false); load(); }
    catch (err) { setMsg(err.message); }
  };

  const total = (k) => (courses || []).reduce((n, c) => n + c[k], 0);
  const expected = total('expected'), acked = total('acknowledged'), overdue = total('overdue');
  const pending = Math.max(expected - acked - overdue, 0);

  return (
    <main className="mt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">Courses you teach</h2>
          <p className="text-sm text-ink/70">Open a course to post assignments and see who has acknowledged.</p>
        </div>
        <button className="btn" onClick={() => setAdding(!adding)} aria-expanded={adding}>{adding ? 'Cancel' : 'New course'}</button>
      </div>
      {msg && <p className="mb-3 text-sm text-red-700" role="alert">{msg}</p>}

      {adding && (
        <form onSubmit={create} className="panel mb-6 grid gap-3 md:grid-cols-[160px_1fr]">
          <input className="input" placeholder="Code, e.g. CS301" aria-label="Course code" value={form.code} onChange={set('code')} required />
          <input className="input" placeholder="Course title" aria-label="Course title" value={form.title} onChange={set('title')} required />
          <textarea className="input md:col-span-2" rows="2" placeholder="Short description (optional)" aria-label="Description" value={form.description} onChange={set('description')} />
          <div className="md:col-span-2"><button className="btn">Create course</button></div>
        </form>
      )}

      {courses === null && !msg && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-56" />)}
        </div>
      )}

      {courses?.length > 0 && (
        <section className="panel mb-6 grid gap-5 md:grid-cols-[220px_1fr] md:items-center" aria-label="Overview">
          <dl className="flex gap-6 md:block md:space-y-2">
            <div><dt className="text-xs text-ink/70">Students taught</dt><dd className="font-display text-3xl">{students}</dd></div>
            <div><dt className="text-xs text-ink/70">Assignments posted</dt><dd className="font-display text-3xl">{total('assignments')}</dd></div>
          </dl>
          <div>
            <p className="mb-2 text-sm font-medium">Submission status across your courses</p>
            {expected > 0 ? <>
              <Progress done={acked} total={expected} overdue={overdue} showText={false} label={`${acked} of ${expected} acknowledged`} />
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-pine" />{acked} acknowledged</li>
                <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-line" />{pending} pending</li>
                <li><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-700" />{overdue} overdue</li>
              </ul>
            </> : <p className="text-sm text-ink/70">Post an assignment to start tracking submissions.</p>}
          </div>
        </section>
      )}

      {courses?.length === 0 && <div className="panel text-sm">You are not teaching any course yet. Create one, then share its join code with your students.</div>}
      {courses?.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => <CourseCard key={c.id} c={c} />)}
        </div>
      )}
    </main>
  );
}
