import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

import { DEMO_DURATION_SECONDS } from '../data/demo';
import { formatTimecode } from '../data/chapters';
import { DemoVideo } from './DemoVideo';
import { PhoneFrame } from './PhoneFrame';

type DemoLightboxProps = {
  open: boolean;
  onClose: () => void;
};

export function DemoLightbox({ open, onClose }: DemoLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-forest-deep/85 p-4 backdrop-blur-md sm:p-8"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-dialog-title"
          onClick={onClose}
        >
          <motion.div
            className="relative my-auto flex w-full max-w-5xl flex-col items-center gap-6 rounded-3xl border border-white/10 bg-[#0A1410] p-5 shadow-2xl sm:p-8 lg:flex-row lg:items-center lg:gap-12 lg:p-10"
            initial={reduced ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close demo"
              className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/20 text-surface/70 transition-colors hover:border-accent hover:text-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <PhoneFrame className="aspect-[9/16] h-[62vh] max-h-[640px] shrink-0 sm:h-[70vh]">
              <DemoVideo controls autoPlay muted ariaLabel="Crewline full demo" />
            </PhoneFrame>

            <div className="max-w-sm pb-2 text-center lg:pb-0 lg:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                Full walkthrough
              </p>
              <h2
                id="demo-dialog-title"
                className="mt-3 text-3xl font-bold tracking-[-0.035em] text-surface"
              >
                Scan. Correct. Validate. Record.
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-surface/60">
                {formatTimecode(DEMO_DURATION_SECONDS)} from the worker dashboard to
                the supervisor’s PO view. Play, pause, or scrub the whole run.
              </p>
              <ul className="mt-6 space-y-2.5 text-left text-[12.5px] text-surface/65">
                {[
                  'Scan a printed delivery note with OCR',
                  'Validate every line against PO-1042',
                  'Fix damaged quantities by voice',
                  'Confirm, record, and see it on the supervisor dashboard',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
