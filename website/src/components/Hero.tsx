import { motion, useReducedMotion } from 'motion/react';
import type { Variants } from 'motion/react';
import { ArrowDown, Play } from 'lucide-react';

import { HeroArtwork } from './HeroArtwork';

type HeroProps = {
  onPlayDemo: () => void;
};

const container: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.075,
      delayChildren: 0.08,
    },
  },
};

const line: Variants = {
  hidden: { y: '110%' },
  show: {
    y: '0%',
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

const fade: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

const WORDS = [
  ['Paper', 'delivery'],
  ['notes,', 'handled.'],
];

export function Hero({ onPlayDemo }: HeroProps) {
  const reduced = useReducedMotion();

  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-line/70 pb-16 pt-28 sm:pb-24 lg:pb-28 lg:pt-36"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_-10%,rgba(232,161,93,0.18),transparent_55%),radial-gradient(ellipse_at_10%_40%,rgba(223,233,221,0.65),transparent_45%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent"
      />

      <div className="shell relative grid items-center gap-14 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10">
        <motion.div
          variants={container}
          initial={reduced ? false : 'hidden'}
          animate={reduced ? undefined : 'show'}
        >
          <motion.div variants={fade} className="flex flex-wrap items-center gap-3">
            <span className="eyebrow">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Delivery intake, rebuilt
            </span>
            <span className="pill">90-second walkthrough</span>
          </motion.div>

          <h1 className="mt-7 text-hero text-ink">
            {WORDS.map((row, rowIndex) => (
              <span key={rowIndex} className="block overflow-hidden pb-[0.08em]">
                <span className="flex flex-wrap gap-x-[0.24em]">
                  {row.map((word, wordIndex) => (
                    <span key={word} className="inline-block overflow-hidden">
                      <motion.span
                        className="inline-block"
                        variants={reduced ? undefined : line}
                      >
                        {wordIndex === 1 && rowIndex === 1 ? (
                          <span className="relative inline-block">
                            handled.
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 220 14"
                              className="absolute -bottom-1 left-0 h-2.5 w-full text-accent"
                              preserveAspectRatio="none"
                            >
                              <path
                                d="M2 10C56 3 164 3 218 8"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeLinecap="round"
                                fill="none"
                              />
                            </svg>
                          </span>
                        ) : (
                          word
                        )}
                      </motion.span>
                    </span>
                  ))}
                </span>
              </span>
            ))}
          </h1>

          <motion.p
            variants={fade}
            className="mt-7 max-w-[34rem] text-[16px] leading-relaxed text-ink-soft sm:text-[17px]"
          >
            Scan a printed delivery note. Validate it against the purchase order.
            Fix it by voice. Record it against stock — in one continuous flow.
          </motion.p>

          <motion.div variants={fade} className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onPlayDemo} className="btn-primary">
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Watch the 90-second run
            </button>
            <a href="#story" className="btn-ghost">
              Scroll the story
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </motion.div>

          <motion.div
            variants={fade}
            className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-medium text-ink-faint"
          >
            <span>Worker + supervisor</span>
            <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
            <span>On-device OCR</span>
            <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
            <span>Gnani voice correction</span>
            <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
            <span>Go + PostgreSQL</span>
          </motion.div>
        </motion.div>

        <div className="relative">
          <HeroArtwork />
        </div>
      </div>
    </section>
  );
}
