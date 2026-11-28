import { useEffect, useState } from 'react';
import { api } from './api';
import Auth from './pages/Auth.jsx';
import Student from './pages/Student.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) return setReady(true);
    api('/auth/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setReady(true));
  }, []);

  const logout = () => { localStorage.removeItem('token'); setUser(null); };
  if (!ready) return null;
  if (!user) return <Auth onAuth={setUser} />;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex items-center justify-between border-b border-line py-5">
        <h1 className="font-display text-2xl">Joineazy <span className="text-sm font-sans text-ink/60">{user.role === 'admin' ? 'Professor' : 'Student'}</span></h1>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.name}</span>
          <button className="btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      {user.role === 'admin' ? <Admin /> : <Student />}
    </div>
  );
}
