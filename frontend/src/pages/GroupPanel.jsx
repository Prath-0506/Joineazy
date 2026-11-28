import { useState } from 'react';
import { api } from '../api';

// Student's group for one course: create it, or (as leader) manage members.
export default function GroupPanel({ courseId, group, userId, onChange }) {
  const [name, setName] = useState('');
  const [who, setWho] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  // Runs an action, reloads, and shows how it affected acknowledgements the group already has.
  const run = async (fn, describe) => {
    setErr(''); setNote('');
    try { const r = await fn(); if (describe) setNote(describe(r)); await onChange(); } catch (e) { setErr(e.message); }
  };
  const s = (n) => `${n} acknowledged assignment${n === 1 ? '' : 's'}`;

  if (!group) return (
    <section className="panel">
      <h3 className="font-semibold">Create your group</h3>
      <p className="mb-3 mt-1 text-sm text-ink/70">Group assignments need a group first. You become its leader and the only person who can acknowledge a submission for everyone.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/groups', { method: 'POST', body: { courseId, name } }); setName(''); }); }}>
        <input className="input" placeholder="Group name" aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn">Create group</button>
      </form>
      {err && <p className="mt-2 text-sm text-red-700" role="alert">{err}</p>}
    </section>
  );

  const leader = group.leaderId === userId;
  return (
    <section className="panel">
      <h3 className="font-semibold">{group.name}</h3>
      <ul className="my-2 divide-y divide-line text-sm">
        {group.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-1.5">
            <span>
              {m.name} {m.id === userId && <span className="text-ink/60">(you)</span>}
              <span className="ml-2 text-ink/60">{m.studentId || m.email}</span>
            </span>
            <span className="flex items-center gap-2">
              {m.id === group.leaderId && <span className="chip border-pine text-pine">Leader</span>}
              {leader && m.id !== userId && (<>
                <button className="text-xs underline" onClick={() => window.confirm(`Make ${m.name} the group leader? Only they will be able to acknowledge from now on.`) &&
                  run(() => api(`/groups/${group.id}/leader`, { method: 'POST', body: { userId: m.id } }), () => `${m.name} is now the leader.`)}>Make leader</button>
                <button className="text-xs underline" onClick={() => run(() => api(`/groups/${group.id}/members/${m.id}`, { method: 'DELETE' }),
                  (r) => r.covered ? `Removed. They are no longer covered by ${s(r.covered)}.` : 'Removed.')}>Remove</button>
              </>)}
            </span>
          </li>
        ))}
      </ul>
      {leader
        ? <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api(`/groups/${group.id}/members`, { method: 'POST', body: { identifier: who } }); setWho(''); return r; }, (r) => r.covered ? `Added. They are now covered by ${s(r.covered)} your group already has.` : 'Added.'); }}>
            <input className="input" placeholder="Add classmate by email or student ID" aria-label="Classmate email or student ID" value={who} onChange={(e) => setWho(e.target.value)} required />
            <button className="btn-ghost">Add</button>
          </form>
        : <p className="text-xs text-ink/70">Only the leader can change who is in the group.</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-ink/70" role="status">{note}</p>
        {(!leader || group.members.length === 1) && (
          <button className="text-xs underline" onClick={() => window.confirm(leader ? 'Dissolve this group?' : `Leave ${group.name}? You will no longer be covered by its acknowledgements.`) &&
            run(() => api(`/groups/${group.id}/leave`, { method: 'POST' }))}>{leader ? 'Dissolve group' : 'Leave group'}</button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-700" role="alert">{err}</p>}
    </section>
  );
}
