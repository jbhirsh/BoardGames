import type { ReactNode } from 'react';
import type { Award, DurationCategory, KeywordId } from '../data/types';
import { useFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import { isKeywordLit } from '../utils/keywordLit';
import DurationPill from './DurationPill';
import KeywordPill from './KeywordPill';
import { AwardsCount } from './AwardsBadge';
import { ChevronIcon } from './Icons';

interface CellsProps {
  name: string;
  players: string;
  cat: DurationCategory;
  /** The play time; the duration pill is left out when it is unknown (empty). */
  dur?: string;
  /** One-line description, shown in the description column and under the name on phones. */
  short: string;
  kw: KeywordId[];
  awards: Award[];
  /** Group label to show beside the name (the collection's grouped sort). */
  groupBadge?: string;
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
  name, players, cat, dur, short, kw, awards, groupBadge, extra, isOpen, onToggle,
}: CellsProps) {
  const { state, dispatch } = useFilter();

  return (
    <>
      <td className="col-name">
        <div className="col-name-wrap">
          <span className="col-name">{name}</span>
          {groupBadge && <span className="group-badge">{groupBadge}</span>}
          <span className="mobile-short">{short}</span>
          <AwardsCount awards={awards} />
        </div>
      </td>
      <td className="col-hide col-players-h col-players">{players}</td>
      <td>
        {dur && (
          <DurationPill
            cat={cat}
            className="row-dur"
            onClick={() => dispatch({ type: 'SET_DURATION', payload: cat })}
          />
        )}
      </td>
      <td className="col-hide col-short">{short}</td>
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
