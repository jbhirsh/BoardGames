import { useFilter } from '../../context/useFilter';
import { useWishlistItems } from '../../context/useWishlistItems';
import { DUR_LABELS, KW, PLAYER_OPTIONS, SORT_OPTIONS, TIME_BUDGETS, playersLabel } from '../../data/keywords';
import { GAMES } from '../../data/games';
import { sortAllowed } from '../../utils/filterState';
import { CheckIcon } from '../Icons';
import RadioOptions from './RadioOptions';
import { markClass, markOffClass, markOnClass, optionClass } from './optionClasses';
import type { DurationFilter, Filterable, KeywordId } from '../../data/types';

// The filter bar's choices, drawn once for both homes: the dropdowns on a
// wide screen, which close on a pick, and the phone's filter sheet, which
// stays open until Done.

interface PickProps {
  /** Called after a pick, e.g. to close the dropdown it came from. */
  onPicked?: () => void;
  /** Laid out as wrapping chips, as the phone's filter sheet has them. */
  chips?: boolean;
}

// A time budget: each keeps every game that fits in it, quick ones included.
const DURATION_OPTIONS: { value: DurationFilter; label: string }[] = [
  { value: 'all', label: 'Any length' },
  ...TIME_BUDGETS.map((b) => ({ value: b, label: DUR_LABELS[b] })),
];

const PLAYERS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Any number' },
  ...PLAYER_OPTIONS.map((n) => ({ value: n, label: n === 10 ? '10+ players' : playersLabel(n) })),
];

export function DurationOptions({ onPicked, chips }: PickProps) {
  const { state, dispatch } = useFilter();
  return (
    <RadioOptions
      label="Time available"
      options={DURATION_OPTIONS}
      selected={state.duration}
      chips={chips}
      onSelect={(value) => {
        dispatch({ type: 'SET_DURATION', payload: value });
        onPicked?.();
      }}
    />
  );
}

export function PlayersOptions({ onPicked, chips }: PickProps) {
  const { state, dispatch } = useFilter();
  return (
    <RadioOptions
      label="Players"
      options={PLAYERS_OPTIONS}
      selected={state.players}
      chips={chips}
      onSelect={(value) => {
        dispatch({ type: 'SET_PLAYERS', payload: value });
        onPicked?.();
      }}
    />
  );
}

export function SortOptions({ onPicked, chips }: PickProps) {
  const { state, dispatch } = useFilter();
  const options = SORT_OPTIONS.filter((o) => sortAllowed(o.value, state.collection));
  return (
    <RadioOptions
      label="Sort"
      options={options}
      selected={state.baseSort}
      chips={chips}
      onSelect={(value) => {
        dispatch({ type: 'SET_SORT', payload: value });
        onPicked?.();
      }}
    />
  );
}

const modeBaseClass =
  'flex-1 cursor-pointer rounded-md border py-1.25 text-[12px] [transition:background_0.15s,color_0.15s,border-color_0.15s]';

/** Any or All, with the `active` hook on the chosen one. */
function modeClass(chosen: boolean): string {
  return `${modeBaseClass} ${chosen ? 'active border-blue-tint/30 bg-blue-bg font-medium text-blue' : 'border-border bg-bg2 text-text2 hover:bg-bg3 hover:text-text'}`;
}

/** Any/All, then every keyword with how many games in view carry it. */
export function KeywordOptions({ chips = false }: Pick<PickProps, 'chips'>) {
  const { state, dispatch } = useFilter();
  const { items: wishlist } = useWishlistItems();
  // Counts follow the Own/Want toggle: the list a keyword would filter is
  // the one whose tally sits next to it.
  const pool: readonly Filterable[] = state.collection === 'want' ? wishlist : GAMES;
  const allKw = Object.entries(KW) as [KeywordId, string][];

  return (
    <>
      <div className={`flex gap-1 ${chips ? 'max-w-50 pb-2' : 'border-b border-border px-2 pt-2 pb-1'}`}>
        <button
          type="button"
          className={modeClass(state.keywordMode === 'or')}
          aria-pressed={state.keywordMode === 'or'}
          onClick={() => dispatch({ type: 'SET_KEYWORD_MODE', payload: 'or' })}
        >
          Any
        </button>
        <button
          type="button"
          className={modeClass(state.keywordMode === 'and')}
          aria-pressed={state.keywordMode === 'and'}
          onClick={() => dispatch({ type: 'SET_KEYWORD_MODE', payload: 'and' })}
        >
          All
        </button>
      </div>
      <div
        className={
          chips
            ? 'flex flex-wrap gap-1.5'
            : 'max-h-62.5 overflow-y-auto p-1.25 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-xs [&::-webkit-scrollbar-thumb]:bg-border2'
        }
      >
        {allKw.map(([id, name]) => {
          const sel = state.keywords.has(id);
          return (
            <button
              key={id}
              type="button"
              className={optionClass(sel, chips)}
              aria-pressed={sel}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: id })}
            >
              <span className={`${markClass} rounded-sm ${sel ? markOnClass : markOffClass}`}>
                {sel && <CheckIcon />}
              </span>
              {name}
              <span className={`dd-opt-ct ml-auto text-[11px] font-normal ${sel ? 'text-text2' : 'text-text3'}`}>
                {pool.filter((g) => g.kw.includes(id)).length}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
