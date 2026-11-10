import { ArrowUpRight, ClipboardCheck, Mic, Play, ScanLine } from 'lucide-react';

type ClosingCTAProps = {
  onPlayDemo: () => void;
};

const STEPS = [
  {
    icon: ScanLine,
    title: 'Scan',
    copy: 'On-device OCR fills the delivery draft from the paper note.',
  },
  {
    icon: Mic,
    title: 'Correct',
    copy: 'Speak a fix. Gnani proposes the change; the worker applies it.',
  },
  {
    icon: ClipboardCheck,
    title: 'Record',
    copy: 'Validated against the PO, then visible to every supervisor.',
  },
];

export function ClosingCTA({ onPlayDemo }: ClosingCTAProps) {
  return (
    <section
      id="flow"
      className="relative scroll-mt-20 overflow-hidden bg-forest-deep text-surface"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(232,161,93,0.18),transparent_38%),radial-gradient(circle_at_88%_90%,rgba(223,233,221,0.1),transparent_42%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(to_right,rgba(255,255,255,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
      />

      <div className="shell relative py-20 sm:py-24">
        <div className="grid items-end gap-10 lg:grid-cols-[1fr_auto]">
          <div>
            <span className="eyebrow !text-surface/55">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              The whole run
            </span>
            <h2 className="mt-6 text-section text-surface">
              Scan. <span className="text-accent">Correct.</span> Validate. Record.
            </h2>
            <p className="mt-5 max-w-[38rem] text-[15px] leading-relaxed text-surface/65 sm:text-[16px]">
              One flow from a paper delivery note to a stock record supervisors can
              trust. No re-keying, no follow-up call, no guessing what arrived.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onPlayDemo}
              className="btn bg-surface text-forest-deep hover:bg-accent hover:text-forest-deep active:scale-[0.985]"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              Watch full demo
            </button>
            <a
              href="#story"
              className="btn border border-surface/25 text-surface hover:border-surface/50 hover:bg-white/5 active:scale-[0.985]"
            >
              Replay the story
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="bg-forest-deep/95 p-6">
              <span className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-accent">
                <step.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-surface">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-surface/55">
                {step.copy}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-medium uppercase tracking-[0.14em] text-surface/40">
          <span>Expo</span>
          <span aria-hidden="true">·</span>
          <span>On-device OCR</span>
          <span aria-hidden="true">·</span>
          <span>Gnani ASR</span>
          <span aria-hidden="true">·</span>
          <span>Go + PostgreSQL</span>
        </div>
      </div>
    </section>
  );
}
