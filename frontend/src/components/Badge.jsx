import Check from './Check.jsx';

// One vocabulary of status badges used on every screen, so a status always looks the same.
const KINDS = {
  acknowledged: ['border-pine bg-pine/10 text-pine', 'Acknowledged', true],
  complete: ['border-pine bg-pine/10 text-pine', 'Complete', true],
  late: ['border-amber-600 bg-amber-600/10 text-amber-600', 'Acknowledged late', true],
  pending: ['border-line bg-paper text-ink/70', 'Pending', false],
  waiting: ['border-line bg-paper text-ink/70', 'Waiting for leader', false],
  overdue: ['border-red-700 bg-red-700/10 text-red-700', 'Overdue', false],
  no_group: ['border-amber-600 bg-amber-600/10 text-amber-600', 'Needs a group', false],
  type: ['border-line bg-white text-ink', '', false],
};

export default function Badge({ kind, children, animate = false }) {
  const [cls, label, check] = KINDS[kind];
  return (
    <span className={`badge ${cls} ${animate && check ? 'pop' : ''}`}>
      {check && <Check animate={animate} className="h-3 w-3" />}
      {children ?? label}
    </span>
  );
}
