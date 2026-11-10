import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import { TOTAL_CHAPTER_WEIGHT, type Chapter } from '../data/chapters';

type ScrollState = {
  activeIndex: number;
  chapterProgress: number;
  overallProgress: number;
  isActive: boolean;
};

const INITIAL: ScrollState = {
  activeIndex: 0,
  chapterProgress: 0,
  overallProgress: 0,
  isActive: false,
};

export function useChapterScroll(
  sectionRef: RefObject<HTMLElement | null>,
  chapters: Chapter[]
) {
  const [state, setState] = useState<ScrollState>(INITIAL);

  useEffect(() => {
    const section = sectionRef.current;

    if (!section) {
      return;
    }

    let frame = 0;

    const update = () => {
      frame = 0;

      const rect = section.getBoundingClientRect();
      const scrollable = section.offsetHeight - window.innerHeight;
      const raw = scrollable > 0 ? -rect.top / scrollable : 0;
      const overallProgress = Math.min(Math.max(raw, 0), 1);
      const isActive = rect.top <= 0 && rect.bottom > 0;

      let cumulative = 0;
      let activeIndex = chapters.length - 1;
      let chapterStart = 0;
      let chapterWeight = 1;

      for (let index = 0; index < chapters.length; index += 1) {
        const chapter = chapters[index];
        const start = cumulative / TOTAL_CHAPTER_WEIGHT;
        const end = (cumulative + chapter.weight) / TOTAL_CHAPTER_WEIGHT;
        cumulative += chapter.weight;

        if (overallProgress < end || index === chapters.length - 1) {
          activeIndex = index;
          chapterStart = start;
          chapterWeight = end - start;
          break;
        }
      }

      const chapterProgress = Math.min(
        Math.max((overallProgress - chapterStart) / Math.max(chapterWeight, 0.0001), 0),
        1
      );

      setState((current) => {
        if (
          current.activeIndex === activeIndex &&
          current.isActive === isActive &&
          Math.abs(current.chapterProgress - chapterProgress) < 0.002 &&
          Math.abs(current.overallProgress - overallProgress) < 0.002
        ) {
          return current;
        }

        return { activeIndex, chapterProgress, overallProgress, isActive };
      });
    };

    const requestUpdate = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    window.addEventListener('orientationchange', requestUpdate);

    const resizeObserver = new ResizeObserver(requestUpdate);
    resizeObserver.observe(section);

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
      window.removeEventListener('orientationchange', requestUpdate);
      resizeObserver.disconnect();
    };
  }, [chapters, sectionRef]);

  return state;
}
