# Crewline showcase site

A static, scroll-driven showcase for the Crewline delivery-intake demo in
[`../app`](../app). Built with Vite, React, TypeScript, Tailwind CSS and Motion.

## Run locally

```bash
cd website
npm install
npm run dev        # http://127.0.0.1:4173
```

```bash
npm run build      # typecheck + static build to dist/
npm run preview    # serve the production build
```

## Add the demo recording

Drop the final screen recording here:

```
website/public/media/crewline-demo.mp4
```

Recommended: portrait `1080x1920`, H.264, faststart, under ~20 MB.

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -movflags +faststart \
  website/public/media/crewline-demo.mp4
```

The site falls back to the delivery-note poster and a "coming soon" state until
the file exists. The phone screen is `9:16`, matching the recording.

The poster is `website/public/media/crewline-demo-poster.png`. Replace it with a
frame from the recording if you want a different first impression.

## Chapter timings

The whole story is driven by one file:

```
website/src/data/chapters.ts
```

Each chapter has `start` / `end` seconds and a `weight` (relative scroll length).
The default map follows the shot list:

| # | Seconds | Chapter |
|---|---|---|
| 1 | 0:00–0:05 | Paper becomes a record |
| 2 | 0:05–0:16 | Scan the paper note |
| 3 | 0:16–0:28 | Checked against PO-1042 |
| 4 | 0:28–0:44 | Correct it by voice |
| 5 | 0:44–0:55 | Damage isn't stock |
| 6 | 0:55–1:04 | Recorded against the PO |
| 7 | 1:04–1:24 | Supervisor sees it immediately |
| 8 | 1:24–1:30 | End card |

If the final recording's timing differs, update `start`, `end`, and optionally
`weight`. The site seeks the video to each chapter start, plays it muted while
the chapter is active, and pauses at the chapter end.

## Structure

```
src/
  data/chapters.ts       chapter copy, timings, callout chips, scroll weights
  data/demo.ts           video + poster paths, fallback duration
  hooks/                 scroll progress, reduced motion, media query
  components/
    Hero.tsx             animated hero
    HeroArtwork.tsx      code-drawn floating note / validation / voice cards
    ChapterStory.tsx     pinned desktop story + static mobile/reduced-motion list
    PhoneFrame.tsx       device frame
    DemoVideo.tsx        video with poster fallback
    CalloutChips.tsx     per-chapter chips around the phone
    ProgressRail.tsx     chapter progress under the phone
    DemoLightbox.tsx     full-demo player
    ClosingCTA.tsx       closing section + flow cards
    Footer.tsx
  styles/global.css      brand tokens, grain, shared utility classes
```

## Behaviour notes

- Desktop: the phone and copy are pinned for the length of the story; copy
  cross-fades in place, the video follows the active chapter.
- Mobile and `prefers-reduced-motion`: no pinning or auto-seek. The recording
  plays with native controls above a static chapter list.
- The nav "Play demo" button opens a lightbox with the full recording.
- No backend calls; the site is fully static.

## Deploy

Any static host works. Build command `npm run build`, output directory
`website/dist` (or `dist` if the host uses `website/` as the root).
