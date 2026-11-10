import { cn } from '../lib/cn';

type CrewlineMarkProps = {
  compact?: boolean;
  inverted?: boolean;
  className?: string;
};

export function CrewlineMark({
  compact = false,
  inverted = false,
  className,
}: CrewlineMarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'relative grid place-items-center rounded-[10px] bg-forest',
          compact ? 'h-9 w-9' : 'h-10 w-10'
        )}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className={compact ? 'h-[19px] w-[19px]' : 'h-[21px] w-[21px]'}
        >
          <path
            d="M4 12.5 12 8.5l8 4-8 4-8-4Z"
            stroke="#FFFDF8"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M4 8.5 12 4.5l8 4-8 4-8-4Z"
            stroke="#FFFDF8"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="5.5" r="1.7" fill="#E8A15D" />
        </svg>
      </span>
      <span
        className={cn(
          'font-semibold tracking-[-0.02em]',
          compact ? 'text-[16px]' : 'text-[18px]',
          inverted ? 'text-surface' : 'text-ink'
        )}
      >
        Crewline
      </span>
    </span>
  );
}
