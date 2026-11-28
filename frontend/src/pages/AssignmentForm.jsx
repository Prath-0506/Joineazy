import { useState } from 'react';
import { api } from '../api';
import { toLocalInput } from '../utils';

export default function AssignmentForm({ courseId, initial, onSaved, onCancel }) {
  const [f, setF] = useState(initial
    ? { title: initial.title, description: initial.description, dueDate: toLocalInput(initial.dueDate), onedriveLink: initial.onedriveLink, submissionType: initial.submissionType }
    : { title: '', description: '', dueDate: '', onedriveLink: '', submissionType: 'individual' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const body = { ...f, courseId, dueDate: new Date(f.dueDate).toISOString() };
      const r = await api(initial ? `/assignments/${initial.id}` : '/assignments', { method: initial ? 'PUT' : 'POST', body });
      onSaved(r.id);
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <form onSubmit={submit} className="panel grid gap-3 md:grid-cols-2">
      <h3 className="font-display text-xl md:col-span-2">{initial ? 'Edit assignment' : 'New assignment'}</h3>
      <label className="text-sm">Title<input className="input mt-1" value={f.title} onChange={set('title')} required /></label>
      <label className="text-sm">Deadline<input className="input mt-1" type="datetime-local" value={f.dueDate} onChange={set('dueDate')} required /></label>
      <fieldset className="md:col-span-2">
        <legend className="text-sm">Submission type</legend>
        <div className="mt-1 flex gap-5 text-sm">
          {[['individual', 'Individual'], ['group', 'Group (leader acknowledges for everyone)']].map(([v, l]) => (
            <label key={v}><input type="radio" name="type" className="mr-1.5" checked={f.submissionType === v} onChange={() => setF({ ...f, submissionType: v })} />{l}</label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm md:col-span-2">OneDrive submission link<input className="input mt-1" type="url" value={f.onedriveLink} onChange={set('onedriveLink')} required /></label>
      <label className="text-sm md:col-span-2">Description<textarea className="input mt-1" rows="3" value={f.description} onChange={set('description')} /></label>
      {err && <p className="text-sm text-red-700 md:col-span-2" role="alert">{err}</p>}
      <div className="flex gap-2 md:col-span-2">
        <button className="btn">{initial ? 'Save changes' : 'Create assignment'}</button>
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
