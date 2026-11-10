import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { CHAPTERS, TOTAL_CHAPTER_WEIGHT, formatTimecode, type Chapter } from '../data/chapters';
import { useChapterScroll } from '../hooks/useChapterScroll';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CalloutChips } from './CalloutChips';
import { DemoVideo } from './DemoVideo';
import { PhoneFrame } from './PhoneFrame';
import { ProgressRail } from './ProgressRail';
import { TimecodeBadge } from './TimecodeBadge';

function ChapterMeta({ chapter, index }: { chapter: Chapter; index: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="eyebrow">
        Chapter {String(index + 1).padStart(2, '0')}
      </span>
      <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-forest">
        {chapter.kicker}
      </span>
      <span className="text-[10px] font-medium tabular-nums text-ink-faint/70">
        {formatTimecode(chapter.start)} – {formatTimecode(chapter.end)}
      </span>
    </div>
  );
}

function ChapterCopy({ chapter, index }: { chapter: Chapter; index: number }) {
  return (
    <>
      <ChapterMeta chapter={chapter} index={index} />
      <h2 className="mt-5 text-chapter text-ink">{chapter.title}</h2>
      <p className="mt-4 max-w-[32rem] text-[15px] leading-relaxed text-ink-soft sm:text-[16px]">
        {chapter.copy}
      </p>
      {chapter.chips.length > 0 ? (
        <ul className="sr-only">
          {chapter.chips.map((chip) => (
            <li key={chip.label}>
              {chip.label}
              {chip.detail ? `: ${chip.detail}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function StaticStory() {
  return (
    <div className="py-10">
      <div className="mx-auto mb-12 w-fit">
        <p className="eyebrow mb-3 justify-center">The run · 90 seconds</p>
        <PhoneFrame className="aspect-[9/16] h-[52vh] max-h-[560px] sm:h-[58vh]">
          <DemoVideo controls ariaLabel="Crewline delivery intake walkthrough" />
        </PhoneFrame>
        <p className="mt-3 text-center text-[11px] font-medium text-ink-faint">
          Full run · 1:30
        </p>
      </div>

      <ol className="mx-auto max-w-[36rem] space-y-10 pb-6">
        {CHAPTERS.map((chapter, index) => (
          <li key={chapter.id} className="border-t border-line pt-7">
            <ChapterMeta chapter={chapter} index={index} />
            <h2 className="mt-3 text-[1.55rem] font-bold leading-tight tracking-[-0.03em] text-ink">
              {chapter.title}
            </h2>
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
              {chapter.copy}
            </p>
            {chapter.chips.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {chapter.chips.map((chip) => (
                  <span key={chip.label} className="pill">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ChapterStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion() ?? false;
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const shouldDriveVideo = isDesktop && !reduced;

  const { activeIndex, chapterProgress, isActive } = useChapterScroll(
    sectionRef,
    CHAPTERS
  );
  const activeChapter = CHAPTERS[activeIndex];
  const totalDuration = CHAPTERS[CHAPTERS.length - 1].end;

  // Jump to the active chapter when the story advances or rewinds.
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !shouldDriveVideo) {
      return;
    }

    const chapter = CHAPTERS[activeIndex];
    try {
      video.currentTime = chapter.start;
    } catch {
      // Metadata may not be available yet; the play effect will retry.
    }
  }, [activeIndex, shouldDriveVideo]);

  // Play while the chapter is active, hold at the chapter boundary.
  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (!shouldDriveVideo || !isActive || chapterProgress > 0.985) {
      video.pause();
      return;
    }

    const chapter = CHAPTERS[activeIndex];

    if (video.currentTime >= chapter.end - 0.06) {
      return;
    }

    if (video.currentTime < chapter.start - 0.5) {
      try {
        video.currentTime = chapter.start;
      } catch {
        // Ignore until the media is ready.
      }
    }

    if (video.paused) {
      void video.play().catch(() => {
        // Browsers may refuse playback until the user interacts; the poster stays.
      });
    }
  }, [activeIndex, chapterProgress, isActive, shouldDriveVideo]);

  // Stop exactly at the chapter end, even if the viewer stops scrolling.
  useEffect(() => {
    const video = videoRef.current;

    if (!video || !shouldDriveVideo) {
      return;
    }

    const chapter = CHAPTERS[activeIndex];
    const onTimeUpdate = () => {
      if (video.currentTime >= chapter.end) {
        video.pause();
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [activeIndex, shouldDriveVideo]);

  return (
    <section
      id="story"
      ref={sectionRef}
      className="relative scroll-mt-20 border-b border-line/70 bg-canvas"
    >
      {/* Desktop: one pinned stage, copy cross-fades in place. */}
      <div
        className={reduced ? 'hidden' : 'hidden lg:block'}
        style={{ height: `${TOTAL_CHAPTER_WEIGHT * 100}vh` }}
      >
        <div className="sticky top-0 flex h-screen items-center">
          <div className="shell grid w-full grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] items-center gap-14 xl:gap-20">
            <div className="relative z-30">
              <div className="mb-3 flex items-center justify-between">
                <span className="eyebrow">
                  The run · {String(activeIndex + 1).padStart(2, '0')} /{' '}
                  {String(CHAPTERS.length).padStart(2, '0')}
                </span>
                <TimecodeBadge current={activeChapter.start} total={totalDuration} />
              </div>

              <div className="relative mx-auto w-fit">
                <PhoneFrame className="aspect-[9/16] h-[min(74vh,650px)]">
                  <DemoVideo
                    videoRef={videoRef}
                    controls={reduced}
                    muted
                    ariaLabel="Crewline delivery intake walkthrough"
                  />
                </PhoneFrame>
                <CalloutChips
                  chips={activeChapter.chips}
                  chapterId={activeChapter.id}
                />
              </div>

              <div className="mx-auto mt-4 w-full max-w-[23rem]">
                <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  <span>{activeChapter.kicker}</span>
                  <span className="tabular-nums">
                    {formatTimecode(activeChapter.start)} –{' '}
                    {formatTimecode(activeChapter.end)}
                  </span>
                </div>
                <ProgressRail
                  chapters={CHAPTERS}
                  activeIndex={activeIndex}
                  chapterProgress={chapterProgress}
                />
              </div>
            </div>

            <div className="relative max-w-[35rem]">
              <motion.div
                key={activeChapter.id}
                initial={reduced ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <ChapterCopy chapter={activeChapter} index={activeIndex} />
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile, and reduced-motion desktop: a calm, static chapter list. */}
      <div className={reduced ? 'block' : 'lg:hidden'}>
        <div className="shell">
          <StaticStory />
        </div>
      </div>
    </section>
  );
}
