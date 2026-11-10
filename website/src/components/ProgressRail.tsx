import type { Chapter } from '../data/chapters';

type ProgressRailProps = {
  chapters: Chapter[];
  activeIndex: number;
  chapterProgress: number;
};

export function ProgressRail({
  chapters,
  activeIndex,
  chapterProgress,
}: ProgressRailProps) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {chapters.map((chapter, index) => {
        const fill =
          index < activeIndex ? 1 : index === activeIndex ? chapterProgress : 0;

        return (
          <div
            key={chapter.id}
            className="h-[3px] flex-1 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-forest transition-[width] duration-150 ease-linear"
              style={{ width: `${Math.round(fill * 100)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
