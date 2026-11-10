import { useCallback, useState } from 'react';

import { ChapterStory } from './components/ChapterStory';
import { ClosingCTA } from './components/ClosingCTA';
import { DemoLightbox } from './components/DemoLightbox';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Nav } from './components/Nav';

export default function App() {
  const [demoOpen, setDemoOpen] = useState(false);

  const openDemo = useCallback(() => setDemoOpen(true), []);
  const closeDemo = useCallback(() => setDemoOpen(false), []);

  return (
    <div className="grain min-h-screen">
      <a
        href="#story"
        className="fixed left-4 top-4 z-[80] -translate-y-24 rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-surface transition-transform focus:translate-y-0"
      >
        Skip to the demo
      </a>

      <Nav onPlayDemo={openDemo} />

      <main>
        <Hero onPlayDemo={openDemo} />
        <ChapterStory />
        <ClosingCTA onPlayDemo={openDemo} />
      </main>

      <Footer />
      <DemoLightbox open={demoOpen} onClose={closeDemo} />
    </div>
  );
}
