import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Progress from '../components/Progress.jsx';

const empty = { title: '', description: '', dueDate: '', onedriveLink: '', assignAll: true, groupIds: [] };

export default function Admin() {
  const [assignments, setAssignments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [stats, setStats] = useState([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [a, g, s] = await Promise.all([api('/assignments'), api('/groups'), api('/assignments/analytics/summary')]);
    setAssignments(a); setGroups(g); setStats(s);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleGroup = (id) => setForm({ ...form, groupIds: form.groupIds.includes(id) ? form.groupIds.filter((x) => x !== id) : [...form.groupIds, id] });

  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api(editId ? `/assignments/${editId}` : '/assignments', { method: editId ? 'PUT' : 'POST', body: form });
      setForm(empty); setEditId(null); load();
    } catch (e2) { setMsg(e2.message); }
  };
  const edit = (a) => {
    setEditId(a.id);
    setForm({ title: a.title, description: a.description, dueDate: a.dueDate.slice(0, 16), onedriveLink: a.onedriveLink, assignAll: a.assignAll, groupIds: a.groupIds });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const remove = async (id) => { if (confirm('Delete this assignment?')) { await api(`/assignments/${id}`, { method: 'DELETE' }); load(); } };

  const maxStudents = Math.max(1, ...stats.map((s) => s.students));

  return (
    <div className="mt-8 space-y-10">
      <section>
        <h2 className="mb-3 font-display text-xl">Submission analytics</h2>
        {!stats.length ? <p className="text-sm text-ink/70">Create an assignment to see analytics.</p> : (
          <div className="panel space-y-4">
            {stats.map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{s.title}</span>
                  <span>{s.groupsComplete}/{s.groups} groups complete · {s.confirmed}/{s.students} students</span></div>
                <div className="h-3 rounded bg-line" style={{ width: `${(s.students / maxStudents) * 100}%`, minWidth: '15%' }}>
                  <div className="h-full rounded bg-pine" style={{ width: `${s.students ? (s.confirmed / s.students) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">{editId ? 'Edit assignment' : 'New assignment'}</h2>
        <form onSubmit={submit} className="panel grid gap-3 md:grid-cols-2">
          <input className="input" placeholder="Title" value={form.title} onChange={set('title')} required />
          <input className="input" type="datetime-local" value={form.dueDate} onChange={set('dueDate')} required />
          <input className="input md:col-span-2" type="url" placeholder="OneDrive submission link" value={form.onedriveLink} onChange={set('onedriveLink')} required />
          <textarea className="input md:col-span-2" rows="2" placeholder="Description" value={form.description} onChange={set('description')} />
          <div className="md:col-span-2 text-sm">
            <label className="mr-4"><input type="radio" checked={form.assignAll} onChange={() => setForm({ ...form, assignAll: true })} /> All students</label>
            <label><input type="radio" checked={!form.assignAll} onChange={() => setForm({ ...form, assignAll: false })} /> Specific groups</label>
            {!form.assignAll && (
              <div className="mt-2 flex flex-wrap gap-3">
                {groups.map((g) => <label key={g.id}><input type="checkbox" checked={form.groupIds.includes(g.id)} onChange={() => toggleGroup(g.id)} /> {g.name}</label>)}
                {!groups.length && <span className="text-ink/70">No groups exist yet.</span>}
              </div>)}
          </div>
          {msg && <p className="text-sm text-red-700 md:col-span-2" role="alert">{msg}</p>}
          <div className="flex gap-2 md:col-span-2">
            <button className="btn">{editId ? 'Save changes' : 'Create assignment'}</button>
            {editId && <button type="button" className="btn-ghost" onClick={() => { setEditId(null); setForm(empty); }}>Cancel</button>}
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Assignments and group progress</h2>
        <div className="space-y-4">
          {assignments.map((a) => (
            <article key={a.id} className="panel">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{a.title}</h3>
                  <p className="text-xs text-ink/70">Due {new Date(a.dueDate).toLocaleString()} · {a.assignAll ? 'All students' : `${a.groupIds.length} groups`}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={() => edit(a)}>Edit</button>
                  <button className="btn-ghost" onClick={() => remove(a.id)}>Delete</button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {a.groups.map((g) => (
                  <div key={g.group_id} className="rounded-md bg-paper p-3">
                    <button className="mb-2 text-left text-sm font-medium underline" onClick={() => setOpen(open === `${a.id}-${g.group_id}` ? null : `${a.id}-${g.group_id}`)}>{g.group_name}</button>
                    <Progress done={g.done} total={g.total} />
                    {open === `${a.id}-${g.group_id}` && (
                      <ul className="mt-2 text-sm">
                        {g.members?.map((m) => <li key={m.email}>{m.confirmed ? 'Confirmed' : 'Pending'}: {m.name}</li>)}
                      </ul>)}
                  </div>
                ))}
                {!a.groups.length && <p className="text-sm text-ink/70">No groups assigned yet.</p>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
