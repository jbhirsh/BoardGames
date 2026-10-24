import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Game } from '../data/types';
import { digitNudge } from '../utils/digitNudge';
import { useWakeLock } from '../hooks/useWakeLock';
import PageHeader from './PageHeader';
import { pageClass } from './sharedClasses';

// The score boxes' digits, moved to the middle of the box for the font in
// use. A hidden line in the boxes' font (16px) gives the layout's own
// numbers: a zero-width block one cap high sits on the baseline.
function measureDigitNudge(): number {
  const line = document.createElement('div');
  line.style.cssText = 'position:absolute;visibility:hidden;font-size:16px;line-height:normal';
  const cap = document.createElement('span');
  cap.style.cssText = 'display:inline-block;width:0;height:1cap';
  line.append('0', cap);
  document.body.append(line);
  const box = line.getBoundingClientRect();
  const mark = cap.getBoundingClientRect();
  line.remove();
  return digitNudge({ height: box.height, baseline: mark.bottom - box.top, capHeight: mark.height });
}

interface Props {
  /** What the pad scores, under the heading: "7 Wonders", "Hearts". */
  name: string;
  /** The box art beside the heading: the game's, or for a deck's game the deck's. */
  art: Pick<Game, 'img' | 'name'>;
  children: ReactNode;
}

/**
 * What every score pad sits in: the page's title, the header (Back, the box
 * art, "Score Calculator" and the game's name), and the boxes' digits set
 * in the middle (--digit-nudge), the pad itself 720px at most so its rows'
 * labels stay near their boxes. While the page is open it holds a screen
 * wake lock (useWakeLock), so a phone on the table doesn't lock between
 * turns.
 */
export default function ScorePadFrame({ name, art, children }: Props) {
  const [nudge] = useState(measureDigitNudge);
  useWakeLock(true);
  return (
    <div className={pageClass} style={{ '--digit-nudge': `${nudge}px` } as CSSProperties}>
      <title>{`${name} score · The Game Room`}</title>
      <PageHeader title="Score Calculator" desc={name} art={art} />
      {/* 720px at most: across the page's whole 960px a row's label sat
          some 870px from its box. A phone's pads are narrower anyway. */}
      <div className="max-w-180">{children}</div>
    </div>
  );
}
