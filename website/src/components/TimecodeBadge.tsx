import { formatTimecode } from '../data/chapters';

type TimecodeBadgeProps = {
  current: number;
  total: number;
  className?: string;
};

export function TimecodeBadge({ current, total, className }: TimecodeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] font-semibold tabular-nums text-ink-soft ${className ?? ''}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
      {formatTimecode(current)}
      <span className="text-ink-faint/70">/</span>
      {formatTimecode(total)}
    </span>
  );
}
