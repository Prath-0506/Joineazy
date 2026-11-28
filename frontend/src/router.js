import { useEffect, useState } from 'react';

// Tiny hash router, so the app needs no extra dependency and works behind nginx without rewrites.
const read = () => window.location.hash.replace(/^#/, '') || '/';

export function useRoute() {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export const go = (path) => { window.location.hash = path; };

export function parseRoute(path) {
  let m = path.match(/^\/courses\/(\d+)\/assignments\/(\d+)$/);
  if (m) return { name: 'course', courseId: +m[1], assignmentId: +m[2] };
  m = path.match(/^\/courses\/(\d+)$/);
  if (m) return { name: 'course', courseId: +m[1] };
  return { name: 'home' };
}
