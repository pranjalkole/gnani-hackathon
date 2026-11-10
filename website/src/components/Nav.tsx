import { useEffect, useState } from 'react';
import { Menu, Play, X } from 'lucide-react';

import { cn } from '../lib/cn';
import { CrewlineMark } from './CrewlineMark';

type NavProps = {
  onPlayDemo: () => void;
};

const LINKS = [
  { href: '#story', label: 'The run' },
  { href: '#flow', label: 'How it works' },
  { href: '#credits', label: 'Credits' },
];

export function Nav({ onPlayDemo }: NavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-out-expo',
        scrolled
          ? 'border-b border-line/80 bg-canvas/85 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      )}
    >
      <div className="shell flex h-16 items-center justify-between gap-4">
        <a href="#top" aria-label="Crewline home" className="rounded-lg">
          <CrewlineMark compact />
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPlayDemo}
            className="btn-primary !min-h-10 !rounded-lg !px-4 text-[13px]"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            Play demo
          </button>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-ink md:hidden"
          >
            {open ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-canvas/95 backdrop-blur-xl md:hidden">
          <nav aria-label="Mobile" className="shell flex flex-col py-3">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-sm font-medium text-ink-soft hover:bg-surface hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
