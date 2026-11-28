// Checkmark that draws itself when `animate` is true (a status has just changed); static otherwise.
export default function Check({ animate = false, className = 'h-4 w-4', delay = 0 }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" strokeDasharray="1"
        className={animate ? 'check-draw' : ''} style={animate ? { animationDelay: `${delay + 0.15}s` } : undefined} />
    </svg>
  );
}
