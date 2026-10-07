// The score pad's icons, all drawn the same way (a 1.8px line in the
// category's colour) so no row mixes emoji, line art and filled shapes.

const PATHS = {
  military: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />,
  treasury: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /></>,
  wonder: <path d="M3 20h18M5 20v-4h14v4M8 16v-4h8v4M10.5 12V8h3v4" />,
  civilian: <path d="M3 9l9-5 9 5zM5.5 9v9M10 9v9M14 9v9M18.5 9v9M3 20h18" />,
  commercial: <path d="M4 10l1.5-5h13L20 10M4 10c0 3.5 5.3 3.5 5.3 0 0 3.5 5.4 3.5 5.4 0 0 3.5 5.3 3.5 5.3 0M5 11v9h14v-9M10 20v-5h4v5" />,
  guilds: <path d="M6 3h12v12l-6 5-6-5zM9 8h6M9 11.5h6" />,
  science: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.3 15h9.4" />,
  // The three science symbols, drawn with more of the cards' detail: a
  // carved stone tablet, a drafting compass, a toothed cog.
  tablets: (
    <>
      <path d="M5.5 21.5V7.5a6.5 6.5 0 0 1 13 0v14z" />
      <path d="M8.5 9.5h1.5M11.5 9.5h4M8.5 12.5h3.5M13.5 12.5h2M8.5 15.5h1.5M11.5 15.5h1.5M14.5 15.5h1M8.5 18.5h4" strokeWidth="1.4" />
    </>
  ),
  compasses: (
    <>
      <path d="M12 1.5v2" />
      <circle cx="12" cy="5.5" r="2" />
      <path d="M10.9 7.2L6 20M13.1 7.2L18 20M6 20l-.6 2.3M18 20l.4 2.2" />
      <path d="M7.6 15.6c2.6 1.7 6.2 1.7 8.8 0" />
    </>
  ),
  gears: (
    <>
      <path d="M10.44 4.56L10.6 2.1h2.8l.16 2.46 2.6 1.08 1.85-1.63 1.98 1.98-1.63 1.85 1.08 2.6 2.46.16v2.8l-2.46.16-1.08 2.6 1.63 1.85-1.98 1.98-1.85-1.63-2.6 1.08-.16 2.46h-2.8l-.16-2.46-2.6-1.08-1.85 1.63-1.98-1.98 1.63-1.85-1.08-2.6-2.46-.16v-2.8l2.46-.16 1.08-2.6-1.63-1.85 1.98-1.98 1.85 1.63z" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  // A crown with a jewel on each point and gems set in its band.
  winner: (
    <>
      <path d="M4 16.5L2.8 8.6l5.4 3.9L12 5.6l3.8 6.9 5.4-3.9L20 16.5z" />
      <rect x="4" y="16.5" width="16" height="4" rx=".8" />
      <circle cx="2.6" cy="6.9" r="1.3" />
      <circle cx="12" cy="3.6" r="1.3" />
      <circle cx="21.4" cy="6.9" r="1.3" />
      <circle cx="8" cy="18.5" r=".6" fill="currentColor" />
      <circle cx="12" cy="18.5" r=".6" fill="currentColor" />
      <circle cx="16" cy="18.5" r=".6" fill="currentColor" />
    </>
  ),
};

export type ScoreIconKind = keyof typeof PATHS;

export function ScoreIcon({ kind }: { kind: ScoreIconKind }) {
  return (
    <svg
      className={`sc-icon sc-icon--${kind}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
