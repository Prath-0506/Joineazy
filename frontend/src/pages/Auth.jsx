import { useState } from 'react';
import { api } from '../api';

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', studentId: '', password: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const { token, user } = await api(`/auth/${mode}`, { method: 'POST', body: f });
      localStorage.setItem('token', token);
      onAuth(user);
    } catch (e2) { setErr(e2.message); }
  };

  return (
    <main className="mx-auto mt-20 max-w-sm px-4">
      <h1 className="font-display text-4xl">Joineazy</h1>
      <p className="mb-6 mt-1 text-sm text-ink/70">Group assignments, one place for students and professors.</p>
      <form onSubmit={submit} className="panel space-y-3">
        {mode === 'register' && (<>
          <input className="input" placeholder="Full name" value={f.name} onChange={set('name')} required />
          <input className="input" placeholder="Student ID" value={f.studentId} onChange={set('studentId')} />
        </>)}
        <input className="input" type="email" placeholder="Email" value={f.email} onChange={set('email')} required />
        <input className="input" type="password" placeholder="Password (6+ characters)" value={f.password} onChange={set('password')} required />
        {err && <p className="text-sm text-red-700" role="alert">{err}</p>}
        <button className="btn w-full">{mode === 'login' ? 'Log in' : 'Create student account'}</button>
        <button type="button" className="w-full text-sm underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'New student? Register' : 'Have an account? Log in'}
        </button>
      </form>
    </main>
  );
}
