import { Check, Mic, ScanLine } from 'lucide-react';

const FLOAT = 'animate-float motion-reduce:animate-none';

function NoteLines() {
  return (
    <div className="mt-3 space-y-2" aria-hidden="true">
      {[
        'Cement bags',
        'Steel rebar',
        'Paint buckets',
      ].map((label, index) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-medium text-ink-soft">{label}</span>
          <span className="flex items-center gap-2">
            <span className="h-1 w-8 rounded-full bg-line" />
            <span className="text-[10px] font-semibold text-ink">
              {[50, 24, 6][index]}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function HeroArtwork() {
  return (
    <div
      className="relative mx-auto aspect-square w-full max-w-[34rem] select-none"
      aria-hidden="true"
    >
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_55%_45%,rgba(232,161,93,0.22),transparent_62%)]" />
      <div className="absolute inset-[20%] rounded-full border border-dashed border-line-strong/60" />

      <svg
        className="absolute inset-0 h-full w-full text-line-strong/70"
        viewBox="0 0 400 400"
        fill="none"
      >
        <path
          d="M116 128C168 96 252 116 286 170"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="4 6"
          strokeLinecap="round"
        />
        <path
          d="M118 268C172 306 262 292 296 236"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="4 6"
          strokeLinecap="round"
        />
      </svg>

      <div
        className={`absolute left-[4%] top-[8%] w-[61%] -rotate-[5deg] rounded-2xl border border-line bg-surface p-4 shadow-[0_30px_60px_-38px_rgba(21,37,31,0.55)] ${FLOAT}`}
        style={{ animationDelay: '-1.2s' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-faint">
              Delivery note
            </p>
            <p className="mt-1 text-lg font-bold tracking-[-0.02em] text-ink">DN-2086</p>
          </div>
          <span className="rounded-md bg-accent-soft px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#925615]">
            PO-1042
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-y border-line/80 py-2.5">
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] text-ink-faint">Supplier</p>
            <p className="text-[10px] font-semibold text-ink">Acme Supplies</p>
          </div>
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] text-ink-faint">Site</p>
            <p className="text-[10px] font-semibold text-ink">Riverside Tower</p>
          </div>
        </div>

        <NoteLines />

        <div className="relative mt-3 overflow-hidden rounded-lg border border-dashed border-line-strong/70 bg-muted/70 p-2">
          <div className="absolute inset-x-0 top-0 h-px animate-scan-line bg-gradient-to-r from-transparent via-accent to-transparent motion-reduce:hidden" />
          <div className="flex items-center gap-2">
            <ScanLine className="h-3.5 w-3.5 text-forest" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
              OCR reading six fields
            </span>
          </div>
        </div>
      </div>

      <div
        className={`absolute right-[1%] top-[16%] w-[37%] rounded-xl border border-line bg-surface p-3 shadow-[0_22px_44px_-30px_rgba(21,37,31,0.55)] ${FLOAT}`}
        style={{ animationDelay: '-3.6s' }}
      >
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-success-soft text-success">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-faint">
              Validated
            </p>
            <p className="text-[11px] font-semibold text-ink">PO-1042 matched</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1 flex-1 rounded-full bg-success/70" />
          <span className="h-1 flex-1 rounded-full bg-success/70" />
          <span className="h-1 flex-1 rounded-full bg-success/30" />
        </div>
      </div>

      <div
        className={`absolute bottom-[5%] left-[10%] w-[64%] rounded-xl border border-line bg-surface p-3.5 shadow-[0_26px_50px_-34px_rgba(21,37,31,0.55)] ${FLOAT}`}
        style={{ animationDelay: '-2.4s' }}
      >
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-forest text-surface">
            <Mic className="h-3.5 w-3.5" />
          </span>
          <p className="text-[12px] font-semibold leading-tight text-ink">
            “Cement bags, two damaged.”
          </p>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div className="flex h-6 flex-1 items-center gap-[3px]">
            {[7, 14, 20, 11, 23, 16, 9, 18, 24, 12, 6, 15, 21, 10, 17].map(
              (height, index) => (
                <span
                  key={index}
                  className="w-[2px] rounded-full bg-forest/35"
                  style={{ height: `${height}px` }}
                />
              )
            )}
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-ink-soft">
            Gnani ASR
          </span>
        </div>
      </div>

      <div
        className={`absolute bottom-[25%] right-[2%] grid h-14 w-14 place-items-center rounded-full bg-accent text-center text-forest-deep shadow-[0_18px_34px_-18px_rgba(232,161,93,0.9)] ${FLOAT}`}
        style={{ animationDelay: '-5s' }}
      >
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.1em] opacity-70">Good</p>
          <p className="text-base font-bold leading-none">48</p>
        </div>
      </div>
    </div>
  );
}
