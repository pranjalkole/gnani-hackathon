import { useState } from 'react';
import type { RefObject } from 'react';

import { DEMO_POSTER_SRC, DEMO_VIDEO_SRC } from '../data/demo';
import { cn } from '../lib/cn';

type DemoVideoProps = {
  videoRef?: RefObject<HTMLVideoElement | null>;
  controls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  className?: string;
  onDuration?: (duration: number) => void;
  ariaLabel?: string;
};

export function DemoVideo({
  videoRef,
  controls = false,
  muted = true,
  autoPlay = false,
  className,
  onDuration,
  ariaLabel = 'Crewline demo recording',
}: DemoVideoProps) {
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-forest-deep', className)}>
      <img
        src={DEMO_POSTER_SRC}
        alt=""
        aria-hidden="true"
        className={cn(
          'absolute inset-0 h-full w-full bg-[#0A1410] object-contain transition-opacity duration-700',
          hasFrame ? 'opacity-0' : 'opacity-100'
        )}
      />

      <video
        ref={videoRef}
        className={cn(
          'relative z-[1] h-full w-full object-cover transition-opacity duration-500',
          hasFrame ? 'opacity-100' : 'opacity-0'
        )}
        src={DEMO_VIDEO_SRC}
        muted={muted}
        playsInline
        controls={controls}
        autoPlay={autoPlay}
        preload="metadata"
        aria-label={ariaLabel}
        onLoadedMetadata={(event) => {
          if (event.currentTarget.duration > 0) {
            onDuration?.(event.currentTarget.duration);
          }
        }}
        onLoadedData={() => setHasFrame(true)}
        onPlaying={() => setHasFrame(true)}
        onSeeked={() => setHasFrame(true)}
        onError={() => setFailed(true)}
      />

      {!hasFrame ? (
        <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col justify-between bg-gradient-to-b from-forest-deep/5 via-transparent to-forest-deep/80">
          <div className="flex items-center justify-between p-4">
            <span className="rounded-full bg-forest-deep/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-surface backdrop-blur">
              90-second run
            </span>
            <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(232,161,93,0.22)]" />
          </div>

          <div className="relative mx-4 mb-5 overflow-hidden rounded-xl border border-white/15 bg-forest-deep/70 p-3.5 backdrop-blur-sm">
            <div className="absolute inset-x-0 top-0 h-px animate-scan-line bg-gradient-to-r from-transparent via-accent to-transparent" />
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-accent/40 text-accent">
                <span className="ml-0.5 block h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current" />
              </span>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-surface/55">
                  {failed ? 'Coming soon' : 'Preparing demo'}
                </p>
                <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-surface/95">
                  {failed
                    ? 'The 90-second walkthrough will play here.'
                    : 'Loading the delivery intake run.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
