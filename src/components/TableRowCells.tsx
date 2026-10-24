import type { ReactNode } from 'react';
import type { Award, Filterable, KeywordId } from '../data/types';
import { useFilterDispatch, useItemFilter } from '../context/useFilter';
import { budgetFor, sortedKw } from '../utils/filterGames';
import { difficultyOf } from '../utils/difficulty';
import { durationCategory } from '../utils/duration';
import DurationPill from './DurationPill';
import KeywordPill from './KeywordPill';
import AwardsBadge from './AwardsBadge';
import { ChevronIcon } from './Icons';
import { cellClass, nameClass } from './tableClasses';
import { pillTapClass } from './sharedClasses';

interface CellsProps {
  name: string;
  players: string;
  /** The play time; the duration pill is left out when it is unknown (empty). */
  dur?: string;
  /** The play time in minutes, which the pill's colour and time filter are chosen by. */
  mins: number;
  /** One-line description, shown in the description column and under the name on phones. */
  short: string;
  kw: KeywordId[];
  awards: Award[];
  /** A tag for the games this one holds (`SubGamesTag`), after the description. */
  subTag?: ReactNode;
  /**
   * The collection's difficulty column, after duration (`GamesTableHead`'s
   * `difficulty`); left out entirely when absent, as in the wishlist.
   */
  difficulty?: Pick<Filterable, 'weight' | 'subgames'>;
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
  name,
  players,
  dur,
  mins,
  short,
  kw,
  awards,
  subTag,
  difficulty,
  extra,
  isOpen,
  onToggle,
}: CellsProps) {
  const { lit } = useItemFilter();
  const dispatch = useFilterDispatch();
  const budget = budgetFor(mins);
  const label = difficulty && difficultyOf(difficulty);
  // The add-ons tag and the award count close the description, on its last
  // line when there is room, so the name column holds only names. They go
  // in the description column and again in the copy folded under the name
  // for narrow widths; CSS shows one of the two. A plain space comes
  // before them, so if they wrap they start flush on their own line.
  const badges = (
    <span className="row-badges whitespace-nowrap *:align-[1px] empty:hidden [&>*+*]:ml-1.5">
      {subTag}
      <AwardsBadge itemName={name} awards={awards} />
    </span>
  );

  return (
    <>
      <td className={`col-name ${cellClass(isOpen)} ${nameClass}`}>
        <div className="col-name-wrap flex flex-col gap-0.75">
          <span className={`col-name ${nameClass}`}>{name}</span>
          {/* Folded under the name where the description column is gone. */}
          <span className="mobile-short block font-sans text-[11.5px] leading-[1.35] font-normal whitespace-normal text-text2 sm:text-[12.5px] xl:hidden">
            {short} {badges}
          </span>
        </div>
      </td>
      <td
        className={`col-hide col-players-h col-players ${cellClass(isOpen)} hidden text-[12.5px] whitespace-nowrap text-text2 lg:table-cell`}
      >
        {players}
      </td>
      <td className={cellClass(isOpen)}>
        {dur && (
          <DurationPill
            cat={durationCategory(mins)}
            className={`row-dur inline-block rounded-[20px] px-2.5 py-0.75 text-[11px] font-medium tracking-[0.4px] whitespace-nowrap [transition:background_0.15s,color_0.15s,border-color_0.15s,transform_0.12s] ${pillTapClass} ${budget ? 'cursor-pointer can-hover:hover:transform-[scale(1.05)] can-hover:hover:border-blue-tint/30 can-hover:hover:bg-blue-bg can-hover:hover:text-blue' : ''}`}
            label={dur}
            budget={budget}
            // A game longer than every budget has none to filter to.
            onClick={budget ? () => dispatch({ type: 'SET_DURATION', payload: budget }) : undefined}
          />
        )}
      </td>
      {difficulty && (
        <td
          className={`col-hide col-diff ${cellClass(isOpen)} hidden text-[12.5px] whitespace-nowrap text-text2 2xl:table-cell`}
        >
          {/* The column header names it, so the cell needn't. */}
          {label ?? (
            // BoardGameGeek doesn't rate a few party games. A dash says so,
            // where an empty cell read as something that failed to render.
            <>
              <span className="diff-none text-text3" aria-hidden="true">
                –
              </span>
              <span className="sr-only">Not rated on BoardGameGeek</span>
            </>
          )}
        </td>
      )}
      <td
        className={`col-hide col-short ${cellClass(isOpen)} hidden text-[12.5px] leading-[1.45] wrap-break-word text-text2 xl:table-cell`}
      >
        {short} {badges}
      </td>
      <td className={`col-hide col-tags col-kw ${cellClass(isOpen)} hidden xl:table-cell`}>
        {sortedKw(kw).map((k) => (
          <KeywordPill
            key={k}
            keyword={k}
            active={lit.has(k)}
            small
            onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: k })}
          />
        ))}
      </td>
      {extra}
      <td className={`col-actions ${cellClass(isOpen)} w-7 text-center whitespace-nowrap`}>
        <button
          type="button"
          className="row-toggle -m-2 inline-flex cursor-pointer items-center justify-center rounded-md p-2 align-middle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          data-focus-target="item"
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <ChevronIcon open={isOpen} />
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
      <td colSpan={colSpan} className="border-b border-border bg-bg2" style={{ padding: 0 }}>
        {/* It opens by growing its one grid row from nothing to its content's height. */}
        <div
          className={`row-expand-inner grid [transition:grid-template-rows_0.32s_cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
          inert={!isOpen}
        >
          <div
            className={`row-expand-content min-h-0 overflow-hidden px-3.5 [transition:padding_0.32s_cubic-bezier(0.16,1,0.3,1)] sm:px-7 ${isOpen ? 'pt-5.5 pb-6' : ''}`}
          >
            {children}
          </div>
        </div>
      </td>
    </tr>
  );
}
