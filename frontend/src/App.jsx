import { useEffect, useState } from 'react';
import { api } from './api';
import { parseRoute, useRoute } from './router';
import Auth from './pages/Auth.jsx';
import StudentDashboard from './pages/StudentDashboard.jsx';
import ProfessorDashboard from './pages/ProfessorDashboard.jsx';
import CoursePage from './pages/CoursePage.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const route = parseRoute(useRoute());

  useEffect(() => {
    if (!localStorage.getItem('token')) return setReady(true);
    api('/auth/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setReady(true));
  }, []);

  const logout = () => { localStorage.removeItem('token'); window.location.hash = '/'; setUser(null); };
  if (!ready) return null;
  if (!user) return <Auth onAuth={setUser} />;
  const admin = user.role === 'admin';

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex items-center justify-between border-b border-line py-5">
        <a href="#/" className="font-display text-2xl">Joineazy <span className="font-sans text-sm text-ink/60">{admin ? 'Professor' : 'Student'}</span></a>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline">{user.name}</span>
          <button className="btn-ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      {route.name === 'course'
        ? <CoursePage key={route.courseId} user={user} courseId={route.courseId} assignmentId={route.assignmentId} />
        : admin ? <ProfessorDashboard /> : <StudentDashboard />}
    </div>
  );
}
