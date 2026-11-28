import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Progress from '../components/Progress.jsx';

export default function Student() {
  const [groups, setGroups] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [name, setName] = useState('');
  const [member, setMember] = useState({});
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(null); // {assignment, group, step}

  const load = useCallback(async () => {
    const [g, a] = await Promise.all([api('/groups'), api('/assignments')]);
    setGroups(g); setAssignments(a);
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (fn) => { setMsg(''); try { await fn(); await load(); } catch (e) { setMsg(e.message); } };

  const createGroup = (e) => { e.preventDefault(); run(async () => { await api('/groups', { method: 'POST', body: { name } }); setName(''); }); };
  const addMember = (gid) => run(async () => { await api(`/groups/${gid}/members`, { method: 'POST', body: { identifier: member[gid] } }); setMember({ ...member, [gid]: '' }); });
  const confirm = () => run(async () => {
    await api(`/assignments/${confirming.assignment.id}/confirm`, { method: 'POST', body: { groupId: confirming.group.group_id, confirm: true } });
    setConfirming(null);
  });

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <h2 className="mb-3 font-display text-xl">Assignments</h2>
        {msg && <p className="mb-3 text-sm text-red-700" role="alert">{msg}</p>}
        {!assignments.length && <p className="text-sm text-ink/70">No assignments yet. Your professor will post them here.</p>}
        <div className="space-y-4">
          {assignments.map((a) => (
            <article key={a.id} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="text-xs text-ink/70">Due {new Date(a.dueDate).toLocaleString()}</p>
                </div>
                <a className="btn-ghost" href={a.onedriveLink} target="_blank" rel="noreferrer">Open OneDrive link</a>
              </div>
              {a.description && <p className="mt-2 text-sm">{a.description}</p>}
              <div className="mt-4 space-y-4">
                {a.groups.map((g) => (
                  <div key={g.group_id} className="rounded-md bg-paper p-3">
                    <p className="mb-2 text-sm font-medium">{g.group_name}</p>
                    <Progress done={g.done} total={g.total} />
                    <div className="mt-3">
                      {g.mine
                        ? <span className="text-sm text-pine">You confirmed your submission.</span>
                        : <button className="btn" onClick={() => setConfirming({ assignment: a, group: g, step: 1 })}>I have submitted</button>}
                    </div>
                  </div>
                ))}
                {!a.groups.length && <p className="text-sm text-ink/70">Create or join a group to confirm this assignment.</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside>
        <h2 className="mb-3 font-display text-xl">My groups</h2>
        <form onSubmit={createGroup} className="mb-4 flex gap-2">
          <input className="input" placeholder="New group name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn">Create</button>
        </form>
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="panel">
              <p className="font-semibold">{g.name}</p>
              <ul className="my-2 text-sm">{g.members?.map((m) => <li key={m.id}>{m.name} <span className="text-ink/60">{m.studentId || m.email}</span></li>)}</ul>
              <div className="flex gap-2">
                <input className="input" placeholder="Student email or ID" value={member[g.id] || ''} onChange={(e) => setMember({ ...member, [g.id]: e.target.value })} />
                <button className="btn-ghost" onClick={() => addMember(g.id)}>Add</button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {confirming && (
        <div className="fixed inset-0 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true">
          <div className="panel w-full max-w-sm">
            {confirming.step === 1 ? (<>
              <h3 className="font-semibold">Have you uploaded your work?</h3>
              <p className="my-2 text-sm">Assignment: {confirming.assignment.title}</p>
              <div className="flex gap-2">
                <button className="btn" onClick={() => setConfirming({ ...confirming, step: 2 })}>Yes, I have submitted</button>
                <button className="btn-ghost" onClick={() => setConfirming(null)}>Not yet</button>
              </div>
            </>) : (<>
              <h3 className="font-semibold">Confirm submission</h3>
              <p className="my-2 text-sm">This records your confirmation for {confirming.group.group_name}. It cannot be undone.</p>
              <div className="flex gap-2">
                <button className="btn" onClick={confirm}>Confirm</button>
                <button className="btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
