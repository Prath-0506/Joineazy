import { useEffect, useState } from 'react';

// Animated progress bar. `done` fills in pine; `overdue` (optional) is a red segment after it.
// The bar starts at 0 and grows to its value on mount, and animates again whenever `done` changes.
export default function Progress({ done, total, overdue = 0, label, showText = true }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(done));
    return () => cancelAnimationFrame(f);
  }, [done]);
  const pct = (n) => (total ? Math.min(100, (n / total) * 100) : 0);
  const complete = total > 0 && done >= total;
  const text = label ?? `${done} of ${total} acknowledged`;
  return (
    <div>
      {showText && (
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span>{text}</span>
          {complete ? <span className="rounded bg-pine px-2 py-0.5 text-white">Complete</span> : <span>{Math.round(pct(done))}%</span>}
        </div>
      )}
      <div className="flex h-2 overflow-hidden rounded bg-line" role="progressbar" aria-label={text}
        aria-valuenow={Math.round(pct(done))} aria-valuemin="0" aria-valuemax="100">
        <div className="bar-fill h-full bg-pine" style={{ width: `${pct(shown)}%` }} />
        {overdue > 0 && <div className="bar-fill h-full bg-red-700" style={{ width: `${pct(overdue)}%` }} />}
      </div>
    </div>
  );
}
