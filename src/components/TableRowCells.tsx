import type { ReactNode } from 'react';
import type { Award, DurationCategory, KeywordId } from '../data/types';
import { useFilter } from '../context/useFilter';
import { budgetFor, sortedKw } from '../utils/filterGames';
import { isKeywordLit } from '../utils/keywordLit';
import DurationPill from './DurationPill';
import KeywordPill from './KeywordPill';
import AwardsBadge from './AwardsBadge';
import { ChevronIcon } from './Icons';

interface CellsProps {
  name: string;
  players: string;
  cat: DurationCategory;
  /** The play time; the duration pill is left out when it is unknown (empty). */
  dur?: string;
  /** The play time in minutes, which the pill's time filter is chosen by. */
  mins: number;
  /** One-line description, shown in the description column and under the name on phones. */
  short: string;
  kw: KeywordId[];
  awards: Award[];
  /** Group label to show beside the name (the collection's grouped sort). */
  groupBadge?: string;
  /** A tag for the games this one holds (`SubGamesTag`), after the description. */
  subTag?: ReactNode;
  /** Any list-specific cell, slotted in before the actions cell to match `GamesTableHead`. */
  extra?: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * The collapsed cells both list views share, in the order `GamesTableHead`
 * lays out its columns. Rendered inside the list's own `<tr>`, which carries
 * the row click and any data attributes.
 */
export default function TableRowCells({
  name, players, cat, dur, mins, short, kw, awards, groupBadge, subTag, extra, isOpen, onToggle,
}: CellsProps) {
  const { state, dispatch } = useFilter();
  const budget = budgetFor(mins);
  // The add-ons tag and the award count close the description, on its last
  // line when there is room, so the name column holds only names. They go
  // in the description column and again in the copy folded under the name
  // for narrow widths; CSS shows one of the two. A plain space comes
  // before them, so if they wrap they start flush on their own line.
  const badges = (
    <span className="row-badges">
      {subTag}
      <AwardsBadge itemName={name} awards={awards} />
    </span>
  );

  return (
    <>
      <td className="col-name">
        <div className="col-name-wrap">
          <span className="col-name">{name}</span>
          {groupBadge && <span className="group-badge">{groupBadge}</span>}
          <span className="mobile-short">{short} {badges}</span>
        </div>
      </td>
      <td className="col-hide col-players-h col-players">{players}</td>
      <td>
        {dur && (
          <DurationPill
            cat={cat}
            className="row-dur"
            label={dur}
            budget={budget}
            // A game longer than every budget has none to filter to.
            onClick={budget ? () => dispatch({ type: 'SET_DURATION', payload: budget }) : undefined}
          />
        )}
      </td>
      <td className="col-hide col-short">{short} {badges}</td>
      <td className="col-hide col-tags col-kw">
        {sortedKw(kw).map((k) => (
          <KeywordPill
            key={k}
            keyword={k as KeywordId}
            active={isKeywordLit(state, k as KeywordId)}
            onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: k as KeywordId })}
          />
        ))}
      </td>
      {extra}
      <td className="col-actions">
        <button
          type="button"
          className="row-toggle"
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${name}`}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          <ChevronIcon />
        </button>
      </td>
    </>
  );
}

interface ExpandProps {
  /** Number of columns in the table, so the panel spans the full row. */
  colSpan: number;
  isOpen: boolean;
  children: ReactNode;
}

/**
 * The expandable second row that follows the cells. Collapsed only visually,
 * so it is inert until opened: nothing in it should take focus or be read out.
 */
export function TableRowExpand({ colSpan, isOpen, children }: ExpandProps) {
  return (
    <tr className="row-expand">
      <td colSpan={colSpan} style={{ padding: 0 }}>
        <div className="row-expand-inner" inert={!isOpen}>
          <div className="row-expand-content">
            {children}
          </div>
        </div>
      </td>
    </tr>
  );
}
