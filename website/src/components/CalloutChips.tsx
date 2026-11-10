import { motion, useReducedMotion } from 'motion/react';

import type { ChapterChip } from '../data/chapters';

type CalloutChipsProps = {
  chips: ChapterChip[];
  chapterId: string;
};

export function CalloutChips({ chips, chapterId }: CalloutChipsProps) {
  const reduced = useReducedMotion();

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden sm:block" aria-hidden="true">
      {chips.map((chip, index) => {
        const position =
          index === 0
            ? '-left-7 top-[20%] sm:-left-10 lg:-left-14'
            : '-right-6 bottom-[24%] sm:-right-9 lg:-right-12';

        return (
          <motion.div
            key={`${chapterId}-${chip.label}`}
            initial={reduced ? false : { opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.55,
              delay: index * 0.12,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={`absolute ${position} flex max-w-[9.5rem] items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-[0_16px_36px_-26px_rgba(21,37,31,0.65)]`}
          >
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_rgba(232,161,93,0.18)]" />
            <span>
              <span className="block text-[11px] font-semibold leading-tight text-ink">
                {chip.label}
              </span>
              {chip.detail ? (
                <span className="mt-0.5 block text-[9.5px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                  {chip.detail}
                </span>
              ) : null}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
