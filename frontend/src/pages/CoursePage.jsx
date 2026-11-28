import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { go } from '../router';
import { accent, dueInfo, studentBadge, toneClass } from '../utils';
import Badge from '../components/Badge.jsx';
import StudentAssignment from './StudentAssignment.jsx';
import ProfessorAssignment from './ProfessorAssignment.jsx';
import AssignmentForm from './AssignmentForm.jsx';

// The assignment page for one course: an assignment list beside the selected assignment's details.
export default function CoursePage({ user, courseId, assignmentId }) {
  const admin = user.role === 'admin';
  const [course, setCourse] = useState(null);
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('view'); // view | new | edit
  const [editing, setEditing] = useState(null);

  const loadList = useCallback(() => api(`/assignments?courseId=${courseId}`).then(setList).catch((e) => setErr(e.message)), [courseId]);
  useEffect(() => {
    setCourse(null); setList(null); setErr(''); setMode('view');
    api(`/courses/${courseId}`).then(setCourse).catch((e) => setErr(e.message));
    loadList();
  }, [courseId, loadList]);

  const open = (id) => go(`/courses/${courseId}/assignments/${id}`);
  const activeId = assignmentId ?? list?.find((a) => a.status === 'pending' || a.status === 'no_group')?.id ?? list?.[0]?.id;
  const color = accent(course?.code);

  if (err && !course) return (
    <main className="mt-8"><p className="panel text-sm text-red-700" role="alert">{err}</p>
      <a className="mt-3 inline-block text-sm underline" href="#/">Back to courses</a></main>
  );

  return (
    <main className="mt-6">
      <a className="text-sm underline" href="#/">All courses</a>
      <header className="mb-6 mt-3 border-l-4 pl-4" style={{ borderLeftColor: color }}>
        {course ? <>
          <span className="chip" style={{ color, borderColor: color }}>{course.code}</span>
          <h2 className="mt-1 font-display text-3xl">{course.title}</h2>
          <p className="text-sm text-ink/70">
            {admin ? <>Students join with code <span className="font-mono font-semibold text-ink">{course.joinCode}</span></> : course.professor}
          </p>
        </> : <div className="skeleton h-16 w-72" />}
      </header>

      <div className="grid gap-6 lg:grid-cols-[290px_1fr]">
        <nav aria-label="Assignments">
          {admin && <button className="btn mb-3 w-full" onClick={() => { setMode('new'); setEditing(null); }}>New assignment</button>}
          {list === null && <div className="skeleton h-28" aria-busy="true" />}
          {list?.length === 0 && <p className="panel text-sm">{admin ? 'No assignments yet. Create the first one.' : 'Your professor has not posted any assignments yet.'}</p>}
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {list?.map((a) => {
              const active = a.id === activeId && mode === 'view';
              const done = admin ? a.expected > 0 && a.acknowledged >= a.expected : a.status === 'acknowledged';
              const due = dueInfo(a.dueDate, done);
              const badge = admin
                ? done ? <Badge kind="complete">{a.acknowledged}/{a.expected} acknowledged</Badge>
                  : <Badge kind={due.tone === 'late' ? 'overdue' : 'pending'}>{a.acknowledged}/{a.expected} acknowledged</Badge>
                : <Badge kind={studentBadge(a)} />;
              return (
                <li key={a.id} className="min-w-[220px] lg:min-w-0">
                  <a href={`#/courses/${courseId}/assignments/${a.id}`} onClick={() => setMode('view')} aria-current={active ? 'page' : undefined}
                    className={`block rounded-lg border p-3 text-sm ${active ? 'border-ink bg-white shadow-sm' : 'border-line hover:bg-white'}`}>
                    <span className="block font-medium leading-snug">{a.title}</span>
                    <span className="mt-0.5 block text-xs text-ink/70">{a.submissionType === 'group' ? 'Group' : 'Individual'}</span>
                    <span className={`mt-1 block text-xs ${toneClass[due.tone]}`}>{due.text}</span>
                    <span className="mt-1.5 block">{badge}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-live="off">
          {err && course && <p className="mb-3 text-sm text-red-700" role="alert">{err}</p>}
          {admin && mode !== 'view'
            ? <AssignmentForm key={editing?.id ?? 'new'} courseId={courseId} initial={editing}
                onCancel={() => setMode('view')}
                onSaved={(id) => { setMode('view'); loadList(); open(id); }} />
            : activeId
              ? admin
                ? <ProfessorAssignment key={activeId} id={activeId}
                    onEdit={(a) => { setEditing(a); setMode('edit'); }}
                    onDeleted={() => { loadList(); go(`/courses/${courseId}`); }} />
                : <StudentAssignment key={activeId} id={activeId} user={user} onChanged={loadList} />
              : list && <p className="panel text-sm text-ink/70">Select an assignment to see its details.</p>}
        </section>
      </div>
    </main>
  );
}
