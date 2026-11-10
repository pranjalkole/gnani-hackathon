import { ArrowUp } from 'lucide-react';

import { CrewlineMark } from './CrewlineMark';

export function Footer() {
  return (
    <footer id="credits" className="scroll-mt-20 border-t border-white/10 bg-forest-deep pb-10">
      <div className="shell flex flex-col gap-6 pt-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CrewlineMark compact inverted />
          <p className="mt-3 max-w-[30rem] text-[12.5px] leading-relaxed text-surface/50">
            Delivery intake, rebuilt. A hackathon demo of scan-to-stock with
            on-device OCR and voice correction.
          </p>
        </div>

        <div className="flex items-center gap-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-surface/35">
            90-second walkthrough
          </p>
          <a
            href="#top"
            aria-label="Back to top"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/15 text-surface/70 transition-colors hover:border-accent hover:text-accent"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className="shell mt-8 flex flex-col gap-2 border-t border-white/10 pt-5 text-[11px] text-surface/30 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Crewline. Demo built for the Gnani hackathon.</p>
        <p>Worker + supervisor · One continuous flow</p>
      </div>
    </footer>
  );
}
