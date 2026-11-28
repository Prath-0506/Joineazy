export default function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span>{done}/{total} confirmed</span>
        {complete ? <span className="rounded bg-pine px-2 py-0.5 text-white">Complete</span> : <span>{pct}%</span>}
      </div>
      <div className="h-2 overflow-hidden rounded bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
        <div className={`h-full ${complete ? 'bg-pine' : 'bg-amber-600'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
