import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import Progress from '../components/Progress.jsx';
import Stamp from '../components/Stamp.jsx';
import Badge from '../components/Badge.jsx';
import Check from '../components/Check.jsx';
import GroupPanel from './GroupPanel.jsx';
import { dueInfo, fmtDate, studentBadge, toneClass } from '../utils';

export default function StudentAssignment({ id, user, onChanged }) {
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');
  const [step, setStep] = useState(0); // 0 closed, 1 "have you uploaded?", 2 "confirm"
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false); // status flipped while this page was open
  const prev = useRef(null);
  const idRef = useRef(id);
  idRef.current = id;

  const load = useCallback(async (quiet) => {
    try {
      const next = await api(`/assignments/${id}`);
      if (idRef.current === id) { setA(next); if (!quiet) setErr(''); }
    } catch (e) { if (!quiet && idRef.current === id) setErr(e.message); }
  }, [id]);

  // Load on open, then poll so a leader's acknowledgement appears on every member's screen.
  useEffect(() => {
    setA(null); setErr(''); setStep(0); setFresh(false); prev.current = null;
    load();
    const t = setInterval(() => { if (!document.hidden) load(true); }, 8000);
    return () => clearInterval(t);
  }, [id, load]);

  useEffect(() => {
    if (!a) return;
    const p = prev.current;
    if (p && p.id === a.id && p.status !== 'acknowledged' && a.status === 'acknowledged') { setFresh(true); onChanged(); }
    prev.current = { id: a.id, status: a.status };
  }, [a]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!step) return;
    const esc = (e) => e.key === 'Escape' && setStep(0);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [step]);

  const acknowledge = async () => {
    setBusy(true); setErr('');
    try { await api(`/assignments/${id}/acknowledge`, { method: 'POST', body: { confirm: true } }); }
    catch (e) { setErr(e.message); }
    setBusy(false); setStep(0); load(true);
  };
  const groupChanged = async () => { await load(true); onChanged(); };

  if (err && !a) return <p className="panel text-sm text-red-700" role="alert">{err}</p>;
  if (!a) return <div className="skeleton h-72" aria-busy="true" />;

  const isGroup = a.submissionType === 'group';
  const done = a.status === 'acknowledged';
  const due = dueInfo(a.dueDate, done);
  const members = a.group?.members || [];
  const leader = members.find((m) => m.id === a.group?.leaderId);
  const bySomeoneElse = isGroup && done && a.acknowledgedBy && leader && leader.id !== user.id;

  return (
    <div className="space-y-4">
      <article className="panel">
        <div className="flex flex-wrap items-center gap-2">
          <Badge kind="type">{isGroup ? 'Group submission' : 'Individual submission'}</Badge>
          <Badge kind={studentBadge(a)} animate={fresh} />
          <span className={`text-sm font-medium ${toneClass[due.tone]}`}>{due.text}</span>
        </div>
        <h3 className="mt-2 font-display text-2xl leading-snug">{a.title}</h3>
        <p className="mt-1 text-sm text-ink/70">Deadline: {fmtDate(a.dueDate)}</p>
        {a.description && <p className="mt-3 max-w-prose whitespace-pre-line text-sm leading-relaxed">{a.description}</p>}
        <a className="btn-ghost mt-4" href={a.onedriveLink} target="_blank" rel="noreferrer">Open OneDrive submission link</a>
      </article>

      <section className={`panel ${fresh && bySomeoneElse ? 'flash' : ''}`} aria-labelledby="status-h">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0" role="status" aria-live="polite">
            <h3 id="status-h" className="font-semibold">Submission status</h3>
            {done && <p className="mt-1 text-sm">
              {isGroup
                ? <>{a.acknowledgedBy} acknowledged this for {a.group.name}{a.membersAtAck ? ` (${a.membersAtAck} member${a.membersAtAck === 1 ? '' : 's'} at the time)` : ''}{bySomeoneElse ? ', so it is marked for you too.' : '.'}</>
                : 'You acknowledged this submission.'}
              {a.late && <span className="text-amber-600"> It was acknowledged after the deadline.</span>}
            </p>}
            {a.status === 'pending' && <p className="mt-1 text-sm">Not acknowledged yet. Upload your work to the OneDrive link, then acknowledge it here so your professor knows it is in.</p>}
            {a.status === 'no_group' && <p className="mt-1 text-sm">You are not in a group for this course yet. Create one below to take part.</p>}
          </div>
          {done && <Stamp at={a.acknowledgedAt} late={a.late} animate={fresh} />}
        </div>

        {a.status !== 'no_group' && (
          <div className="mt-4">
            <Progress done={done ? (isGroup ? members.length : 1) : 0} total={isGroup ? members.length : 1}
              label={isGroup ? `${done ? members.length : 0} of ${members.length} group members covered` : done ? 'Acknowledged' : 'Not acknowledged'} />
          </div>
        )}

        {a.status !== 'no_group' && (
          <ul className="mt-4 divide-y divide-line text-sm" aria-label={isGroup ? 'Group members covered' : 'Your submission'}>
            {(isGroup ? members : [{ id: user.id, name: 'You' }]).map((m, i) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-500 ${done ? 'border-pine bg-pine text-white' : 'border-line text-transparent'}`}>
                    <Check animate={done && fresh} className="h-3 w-3" delay={i * 0.12} />
                  </span>
                  {isGroup ? <>{m.name}{m.id === user.id && <span className="text-ink/60">(you)</span>}</> : m.name}
                  {isGroup && m.id === a.group.leaderId && <Badge kind="type">Leader</Badge>}
                </span>
                <span className={done ? 'text-pine' : 'text-ink/60'}>{done ? (isGroup ? 'Covered' : 'Acknowledged') : 'Not yet'}</span>
              </li>
            ))}
          </ul>
        )}

        {a.status === 'pending' && (
          <div className="mt-4">
            {(!isGroup || a.isLeader)
              ? <button className="btn" onClick={() => setStep(1)}>{isGroup ? 'Acknowledge for my group' : 'Acknowledge submission'}</button>
              : <>
                  <button className="btn" disabled aria-describedby="leader-note">Acknowledge for my group</button>
                  <p id="leader-note" className="mt-2 text-sm text-ink/70">Only your group leader{leader ? `, ${leader.name},` : ''} can acknowledge. This page updates by itself once they do.</p>
                </>}
          </div>
        )}
        {err && <p className="mt-3 text-sm text-red-700" role="alert">{err}</p>}
      </section>

      {isGroup && <GroupPanel courseId={a.courseId} group={a.group} userId={user.id} onChange={groupChanged} />}

      {step > 0 && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
          <div className="panel w-full max-w-sm">
            {step === 1 ? <>
              <h3 id="dlg-h" className="font-semibold">Have you uploaded your work?</h3>
              <p className="my-2 text-sm">Your files for “{a.title}” should be in the OneDrive folder before you acknowledge.</p>
              <div className="flex gap-2">
                <button className="btn" autoFocus onClick={() => setStep(2)}>Yes, it is uploaded</button>
                <button className="btn-ghost" onClick={() => setStep(0)}>Not yet</button>
              </div>
            </> : <>
              <h3 id="dlg-h" className="font-semibold">Confirm acknowledgement</h3>
              <p className="my-2 text-sm">{isGroup
                ? `This marks “${a.title}” as submitted for all ${members.length} members of ${a.group.name}. It cannot be undone.`
                : `This records that you submitted “${a.title}”. It cannot be undone.`}</p>
              <div className="flex gap-2">
                <button className="btn" autoFocus disabled={busy} onClick={acknowledge}>{busy ? 'Saving' : 'Acknowledge'}</button>
                <button className="btn-ghost" disabled={busy} onClick={() => setStep(0)}>Cancel</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </div>
  );
}
