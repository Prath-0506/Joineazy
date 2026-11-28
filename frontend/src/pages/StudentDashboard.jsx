import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Progress from '../components/Progress.jsx';
import Badge from '../components/Badge.jsx';
import { accent, dueInfo, toneClass } from '../utils';

function CourseCard({ c }) {
  const due = c.nextDue ? dueInfo(c.nextDue, false) : null;
  return (
    <a href={`#/courses/${c.id}`}
      className="panel group flex flex-col gap-3 border-t-4 transition-shadow hover:shadow-md"
      style={{ borderTopColor: accent(c.code) }}>
      <div>
        <span className="chip" style={{ color: accent(c.code), borderColor: accent(c.code) }}>{c.code}</span>
        <h3 className="mt-2 font-display text-xl leading-snug group-hover:underline">{c.title}</h3>
        <p className="text-sm text-ink/70">{c.professor}</p>
      </div>
      {c.total
        ? <Progress done={c.done} total={c.total} label={`${c.done} of ${c.total} assignments acknowledged`} />
        : <p className="text-sm text-ink/70">No assignments posted yet.</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 text-sm">
        {c.total > 0 && c.done === c.total && <Badge kind="complete">All acknowledged</Badge>}
        {c.overdue > 0 && <Badge kind="overdue">{c.overdue} overdue</Badge>}
        {due && !c.overdue && <span className={toneClass[due.tone]}>Next: {due.text.toLowerCase()}</span>}
      </div>
    </a>
  );
}

export default function StudentDashboard() {
  const [courses, setCourses] = useState(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api('/courses').then(setCourses).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const join = async (e) => {
    e.preventDefault(); setMsg('');
    try { await api('/courses/join', { method: 'POST', body: { joinCode: code } }); setCode(''); load(); }
    catch (err) { setMsg(err.message); }
  };

  return (
    <main className="mt-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">Your courses</h2>
          <p className="text-sm text-ink/70">Open a course to see its assignments and acknowledge your submissions.</p>
        </div>
        <form onSubmit={join} className="flex gap-2">
          <input className="input w-40" placeholder="Course join code" aria-label="Course join code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <button className="btn">Join course</button>
        </form>
      </div>
      {msg && <p className="mb-3 text-sm text-red-700" role="alert">{msg}</p>}

      {courses === null && !msg && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-44" />)}
        </div>
      )}
      {courses?.length === 0 && (
        <div className="panel text-sm">You are not enrolled in any course yet. Enter the join code your professor shared to add one.</div>
      )}
      {courses?.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => <CourseCard key={c.id} c={c} />)}
        </div>
      )}
    </main>
  );
}
