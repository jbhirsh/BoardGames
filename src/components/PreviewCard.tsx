import { useId, useState } from 'react';
import { KW } from '../data/keywords';
import type { PreviewDetails } from '../utils/lookupNotice';
import { shortDesc } from '../utils/shortDesc';
import { adminMutedClass } from './formClasses';
import { cardMoreClass } from './sharedClasses';

const playersText = (min: number, max: number) => (min === max ? `${min}` : max >= 99 ? `${min}+` : `${min}–${max}`);

/**
 * What BoardGameGeek has for a game, shown before anything is stored: on
 * the owner's add form and queue (AdminPanel) and on the page an emailed
 * approve link opens (EmailedDecisionPage). In a queued suggestion's row
 * it sits close under the name, on grey; `className` sets its margin
 * where the page spaces it (14px above it otherwise). Its description opens
 * on the first sentence, as the game's row and card will once it's saved,
 * and More shows the rest: the whole of it is what gets saved.
 */
export default function PreviewCard({
  details,
  queued = false,
  className,
}: {
  details: PreviewDetails;
  queued?: boolean;
  className?: string;
}) {
  const facts = [`${playersText(details.min, details.max)} ${details.max === 1 ? 'player' : 'players'}`];
  if (details.mins > 0) facts.push(`${details.mins} min`);
  const [moreOpen, setMoreOpen] = useState(false);
  const descId = useId();
  const short = shortDesc(details.desc);
  const hasMore = short !== details.desc.trim();
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-border p-3 ${queued ? 'bg-bg2' : 'bg-surface'} ${className ?? (queued ? 'mt-0.5' : 'mt-3.5')}`}
    >
      {details.img && (
        <img
          className="size-16 flex-none rounded-control border border-border bg-art-matte object-contain filter-(--art-dim)"
          src={details.img}
          alt=""
          width={64}
          height={64}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13.5px] font-semibold text-dark">
          {details.name}
          {details.year !== undefined && <span className={adminMutedClass}> ({details.year})</span>}
        </p>
        <p className={adminMutedClass}>{facts.join(' · ')}</p>
        {details.desc && (
          <p className="text-[12.5px] leading-[1.45] text-text" id={descId}>
            {moreOpen || !hasMore ? details.desc : short}
            {hasMore && (
              <>
                {' '}
                <button
                  type="button"
                  className={cardMoreClass}
                  aria-expanded={moreOpen}
                  aria-controls={descId}
                  aria-label={`${moreOpen ? 'Less' : 'More'} about ${details.name}`}
                  onClick={() => setMoreOpen((o) => !o)}
                >
                  {moreOpen ? 'Less' : 'More'}
                </button>
              </>
            )}
          </p>
        )}
        {details.kw.length > 0 && (
          <ul className="mt-0.5 flex flex-wrap gap-1.5" aria-label="Keywords">
            {details.kw.map((k) => (
              <li key={k} className="rounded-[20px] border border-border bg-bg2 px-2 py-0.5 text-[11.5px] text-text2">
                {KW[k as keyof typeof KW] ?? k}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
