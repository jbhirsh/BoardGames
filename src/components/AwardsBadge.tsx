import { useState } from 'react';
import type { Award } from '../data/types';
import { awardLine, honoursSummary, splitHonours } from '../utils/honours';
import Popover from './Popover';
import { RosetteIcon } from './Icons';
import { detailHeadingClass, detailSectionClass, pillShapeClass, pillTapClass, tapTargetClass } from './sharedClasses';

/** How many of the other honours an open card, row or line shows before "N more". */
const OTHERS_SHOWN = 3;

const listItemClass = 'wrap-anywhere';

/** Honours one per line, "Name, year" and the result after anything that isn't a win; `boxed` in an open card, row or line, side by side where there's room. */
function AwardsList({ awards, boxed = false }: { awards: Award[]; boxed?: boolean }) {
  return (
    <ul
      className={`awards-list flex-col text-[12px] leading-normal text-text2 ${boxed ? 'mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-x-6 gap-y-0.75 rounded-lg border border-border bg-surface px-2.5 py-2' : 'flex gap-0.75'}`}
    >
      {awards.map((a) => (
        <li key={`${a.name}-${a.year}-${a.result}`} className={listItemClass}>
          {awardLine(a)}
        </li>
      ))}
    </ul>
  );
}

/** The other honours, three at first and a button for the rest, so many nominations don't drown a game's wins. */
function OtherHonours({ others }: { others: Award[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? others : others.slice(0, OTHERS_SHOWN);
  const more = others.length - shown.length;
  return (
    <>
      <h3 className={`${detailHeadingClass} mt-3`}>Other honours · {others.length}</h3>
      <AwardsList awards={shown} boxed />
      {more > 0 && (
        <button
          type="button"
          className="mt-1 cursor-pointer text-[12px] font-semibold text-blue hover:underline focus-visible:rounded-control focus-visible:outline-2 focus-visible:outline-blue"
          onClick={() => setAll(true)}
        >
          {more} more
        </button>
      )}
    </>
  );
}

/**
 * The Awards section of an open card or list row: the wins in full, under a
 * heading, then the other honours (nominations, placings). Nothing for an
 * entry with none.
 */
export function AwardsSection({ awards = [] }: { awards?: Award[] }) {
  const { wins, others } = splitHonours(awards);
  if (awards.length === 0) return null;
  return (
    <div className={`${detailSectionClass} row-awards`}>
      {wins.length > 0 && (
        <>
          <h3 className={detailHeadingClass}>Awards</h3>
          <AwardsList awards={wins} boxed />
        </>
      )}
      {others.length > 0 && <OtherHonours others={others} />}
    </div>
  );
}

function Trophy({ count }: { count: number }) {
  return (
    <>
      <span className="text-[11px] leading-none" aria-hidden="true">
        🏆
      </span>
      <span className="tabular-nums">{count}</span>
    </>
  );
}

const awardsButtonBaseClass = `inline-flex cursor-pointer items-center gap-1 ${pillShapeClass} [transition:background_0.2s,border-color_0.2s] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue`;

/**
 * The sticker's tap area: 44px on a phone (tapTargetClass), where nothing
 * else is near it on the art, and the pills' own from sm: up, where
 * tapTargetClass stops.
 */
const stickerTapClass = `${tapTargetClass} sm:relative sm:after:absolute sm:after:-inset-x-0.5 sm:after:-inset-y-0.75 sm:after:content-['']`;

/** The gold trophy pill, deeper while hovered or open. */
function awardsButtonClass(open: boolean, tap: string): string {
  return `${awardsButtonBaseClass} ${tap} ${open ? 'border-gold/65 bg-gold/24' : 'border-gold/40 bg-gold/12 hover:border-gold/65 hover:bg-gold/24'}`;
}

/** The grey pill of a game with honours but no wins, in the keyword pills' border and fill. */
function honoursButtonClass(open: boolean, tap: string): string {
  return `${awardsButtonBaseClass} ${tap} ${open ? 'border-border-hover bg-surface' : 'border-border bg-bg2 hover:border-border-hover'}`;
}

interface Props {
  itemName: string;
  awards?: Award[];
  /** A list row's smaller pill. */
  small?: boolean;
  /**
   * On a card's art (stickerClass): honours without wins as a rosette and
   * their count, as "Nominated 6 times" won't fit there, and a 44px tap on a
   * phone.
   */
  sticker?: boolean;
}

/**
 * A game's honours as a pill that opens their list (hover on a pointer, tap
 * on touch): a gold trophy counting the wins, its list the wins and one
 * quiet line counting the rest by result, or, for a game with honours but
 * no wins, a grey pill saying what they are ("Nominated 6 times"), or on a
 * card's art (`sticker`) a rosette and their count, its name saying both.
 * Renders nothing for a game with none.
 */
export default function AwardsBadge({ itemName, awards = [], small = false, sticker = false }: Props) {
  const { wins, others } = splitHonours(awards);
  if (awards.length === 0) return null;
  const rest = honoursSummary(others);
  const size = small ? 'text-[11px]' : 'text-[11.5px]';
  const tap = sticker ? stickerTapClass : pillTapClass;
  if (wins.length === 0) {
    // The sticker's name carries the count it shows, then what they are.
    const count = `${others.length} ${others.length === 1 ? 'honour' : 'honours'}`;
    return (
      <Popover
        className={`inline-flex font-sans ${size} font-semibold whitespace-nowrap text-text2`}
        buttonClassName={(open) => honoursButtonClass(open, tap)}
        label={sticker ? `${itemName}: ${count} (${rest}), show which` : `${itemName}: ${rest}, show which`}
        title={`${itemName}: ${rest}`}
        trigger={
          sticker ? (
            <>
              <RosetteIcon />
              <span className="tabular-nums">{others.length}</span>
            </>
          ) : (
            <span>{rest}</span>
          )
        }
      >
        <AwardsList awards={others} />
      </Popover>
    );
  }
  const label = `${wins.length} ${wins.length === 1 ? 'award' : 'awards'}`;
  return (
    <Popover
      className={`awards inline-flex font-sans ${size} font-semibold whitespace-nowrap text-award-fg`}
      buttonClassName={(open) => awardsButtonClass(open, tap)}
      label={`${itemName}: ${label}, show which`}
      title={`${itemName}: ${label}`}
      trigger={<Trophy count={wins.length} />}
    >
      <AwardsList awards={wins} />
      {rest && <p className="mt-1.5 text-[12px] text-text3">{rest}</p>}
    </Popover>
  );
}
