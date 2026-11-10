export type ChapterChip = {
  label: string;
  detail?: string;
};

export type Chapter = {
  id: string;
  start: number;
  end: number;
  kicker: string;
  title: string;
  copy: string;
  chips: ChapterChip[];
  /** Relative scroll length for this chapter. */
  weight: number;
};

export const CHAPTERS: Chapter[] = [
  {
    id: 'hook',
    start: 0,
    end: 5,
    kicker: 'Worker dashboard',
    title: 'Paper becomes a record.',
    copy: 'A printed delivery note is about to become a validated stock record.',
    chips: [{ label: 'Worker mode', detail: 'Signed in' }],
    weight: 0.6,
  },
  {
    id: 'scan',
    start: 5,
    end: 16,
    kicker: 'Scan',
    title: 'Scan the paper note.',
    copy: 'Frame the note and tap the shutter. On-device OCR fills the delivery draft in seconds.',
    chips: [
      { label: 'Camera', detail: 'DN-2086' },
      { label: 'OCR', detail: '6 fields read' },
    ],
    weight: 1,
  },
  {
    id: 'validate',
    start: 16,
    end: 28,
    kicker: 'Validate',
    title: 'Checked against PO-1042.',
    copy: 'Every line is matched to the purchase order before anything is recorded.',
    chips: [{ label: 'PO-1042', detail: 'Matches the order' }],
    weight: 1,
  },
  {
    id: 'voice',
    start: 28,
    end: 44,
    kicker: 'Correct',
    title: 'Correct it by voice.',
    copy: '“Cement bags, two damaged.” Gnani turns the sentence into a proposed change. One tap applies it.',
    chips: [
      { label: '“Two damaged”', detail: 'Gnani ASR' },
      { label: 'Apply 1 change', detail: 'Reviewed' },
    ],
    weight: 1.2,
  },
  {
    id: 'confirm',
    start: 44,
    end: 55,
    kicker: 'Confirm',
    title: 'Damage isn’t stock.',
    copy: 'Good = 50 − 2. The note is confirmed with the numbers that actually landed on site.',
    chips: [
      { label: 'Good 48', detail: 'of 50' },
      { label: 'Damaged 2', detail: 'Logged' },
    ],
    weight: 0.9,
  },
  {
    id: 'record',
    start: 55,
    end: 64,
    kicker: 'Record',
    title: 'Recorded against the PO.',
    copy: 'The delivery is written back to PO-1042 and its status updates immediately.',
    chips: [{ label: 'Delivery recorded', detail: 'PO-1042' }],
    weight: 0.8,
  },
  {
    id: 'supervisor',
    start: 64,
    end: 84,
    kicker: 'Supervisor',
    title: 'The supervisor sees it immediately.',
    copy: '48 of 50 received, 2 remaining, 2 damaged. No re-keying, no phone call.',
    chips: [
      { label: '48 / 50', detail: 'Received' },
      { label: 'Remaining 2', detail: 'Open' },
    ],
    weight: 1.3,
  },
  {
    id: 'end',
    start: 84,
    end: 90,
    kicker: 'End card',
    title: 'That’s the whole run.',
    copy: 'Scan. Correct. Validate. Record. From a paper note to a trusted stock record.',
    chips: [],
    weight: 0.6,
  },
];

export const TOTAL_CHAPTER_WEIGHT = CHAPTERS.reduce(
  (total, chapter) => total + chapter.weight,
  0
);

export function formatTimecode(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
