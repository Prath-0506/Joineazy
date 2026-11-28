import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import Progress from '../components/Progress.jsx';
import Badge from '../components/Badge.jsx';
import { dueInfo, fmtDate, toneClass } from '../utils';

// Badge for one roster row: acknowledged (with time), late, overdue or pending.
const Status = ({ at, due }) => at
  ? <Badge kind={new Date(at) > new Date(due) ? 'late' : 'acknowledged'}>{new Date(at) > new Date(due) ? 'Late' : 'Acknowledged'} {fmtDate(at)}</Badge>
  : <Badge kind={new Date(due) < Date.now() ? 'overdue' : 'pending'} />;

export default function ProfessorAssignment({ id, onEdit, onDeleted }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');
  const idRef = useRef(id);
  idRef.current = id;

  const load = useCallback(async (quiet) => {
    try {
      const next = await api(`/assignments/${id}`);
      if (idRef.current === id) { setA(next); if (!quiet) setErr(''); }
    } catch (e) { if (!quiet && idRef.current === id) setErr(e.message); }
  }, [id]);

  useEffect(() => {
    setA(null); setErr(''); load();
    const t = setInterval(() => { if (!document.hidden) load(true); }, 10000);
    return () => clearInterval(t);
  }, [id, load]);

  const remove = async () => {
    if (!window.confirm(`Delete “${a.title}” and all acknowledgements for it?`)) return;
    try { await api(`/assignments/${id}`, { method: 'DELETE' }); onDeleted(); } catch (e) { setErr(e.message); }
  };

  if (err && !a) return <p className="panel text-sm text-red-700" role="alert">{err}</p>;
  if (!a) return <div className="skeleton h-72" aria-busy="true" />;

  const isGroup = a.submissionType === 'group';
  const unit = isGroup ? 'groups' : 'students';
  const due = dueInfo(a.dueDate, a.acknowledged >= a.expected && a.expected > 0);
  const overdue = due.tone === 'late' ? Math.max(a.expected - a.acknowledged, 0) : 0;

  return (
    <div className="space-y-4">
      <article className="panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge kind="type">{isGroup ? 'Group submission' : 'Individual submission'}</Badge>
              <span className={`text-sm font-medium ${toneClass[due.tone]}`}>{due.text}</span>
            </div>
            <h3 className="mt-2 font-display text-2xl leading-snug">{a.title}</h3>
            <p className="mt-1 text-sm text-ink/70">Deadline: {fmtDate(a.dueDate)}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => onEdit(a)}>Edit</button>
            <button className="btn-ghost" onClick={remove}>Delete</button>
          </div>
        </div>
        {a.description && <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed">{a.description}</p>}
        <a className="btn-ghost mt-4" href={a.onedriveLink} target="_blank" rel="noreferrer">Open OneDrive submission link</a>
      </article>

      <section className="panel">
        <h3 className="mb-3 font-semibold">Submission status</h3>
        {a.expected > 0
          ? <Progress done={a.acknowledged} total={a.expected} overdue={overdue} label={`${a.acknowledged} of ${a.expected} ${unit} acknowledged`} />
          : <p className="text-sm text-ink/70">{isGroup ? 'No groups exist in this course yet.' : 'No students are enrolled yet.'}</p>}

        {!isGroup && a.students?.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {a.students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{s.name} <span className="text-ink/60">{s.studentId || s.email}</span></span>
                <Status at={s.acknowledgedAt} due={a.dueDate} />
              </li>
            ))}
          </ul>
        )}

        {isGroup && a.groups?.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {a.groups.map((g) => (
              <li key={g.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{g.name} <span className="font-normal text-ink/60">led by {g.leader}</span></span>
                  <Status at={g.acknowledgedAt} due={a.dueDate} />
                </div>
                <p className="text-ink/70">{(g.members || []).join(', ')}</p>
                {g.acknowledgedAt && <p className="text-xs text-ink/70">Acknowledged by {g.acknowledgedBy}{g.membersAtAck ? ` for ${g.membersAtAck} member${g.membersAtAck === 1 ? '' : 's'}` : ''}</p>}
              </li>
            ))}
          </ul>
        )}
        {isGroup && a.ungrouped?.length > 0 && (
          <p className="mt-3 text-sm text-amber-600">Not in a group yet: {a.ungrouped.join(', ')}</p>
        )}
      </section>
    </div>
  );
}
