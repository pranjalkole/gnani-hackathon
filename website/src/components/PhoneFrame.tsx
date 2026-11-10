import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

type PhoneFrameProps = {
  children: ReactNode;
  className?: string;
  screenClassName?: string;
};

export function PhoneFrame({ children, className, screenClassName }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        'relative rounded-[2.7rem] border border-white/10 bg-[#0A1410] p-[7px]',
        'shadow-[0_40px_90px_-45px_rgba(14,44,36,0.75),0_18px_40px_-30px_rgba(14,44,36,0.55)]',
        className
      )}
    >
      <div
        className={cn(
          'relative h-full w-full overflow-hidden rounded-[2.2rem] bg-forest-deep',
          screenClassName
        )}
      >
        {children}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[10px] z-20 h-[16px] w-[76px] -translate-x-1/2 rounded-full bg-[#08100D]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 rounded-[2.2rem] ring-1 ring-inset ring-white/10"
        />
      </div>
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-[22%] h-12 w-[3px] rounded-l-full bg-[#1B2C25]"
      />
      <span
        aria-hidden="true"
        className="absolute -right-[3px] top-[18%] h-16 w-[3px] rounded-r-full bg-[#1B2C25]"
      />
    </div>
  );
}
