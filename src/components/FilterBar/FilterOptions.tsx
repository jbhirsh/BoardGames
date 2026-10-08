import { useFilter } from '../../context/useFilter';
import { useWishlistItems } from '../../context/useWishlistItems';
import { DUR_LABELS, KW, PLAYER_OPTIONS, SORT_OPTIONS, TIME_BUDGETS, playersLabel } from '../../data/keywords';
import { GAMES } from '../../data/games';
import { CheckIcon } from '../Icons';
import RadioOptions from './RadioOptions';
import type { DurationFilter, Filterable, KeywordId } from '../../data/types';

// The filter bar's choices, drawn once for both homes: the dropdowns on a
// wide screen, which close on a pick, and the phone's filter sheet, which
// stays open until Done.

interface PickProps {
  /** Called after a pick, e.g. to close the dropdown it came from. */
  onPicked?: () => void;
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

export function DurationOptions({ onPicked }: PickProps) {
  const { state, dispatch } = useFilter();
  return (
    <RadioOptions
      label="Time available"
      options={DURATION_OPTIONS}
      selected={state.duration}
      onSelect={(value) => {
        dispatch({ type: 'SET_DURATION', payload: value });
        onPicked?.();
      }}
    />
  );
}

export function PlayersOptions({ onPicked }: PickProps) {
  const { state, dispatch } = useFilter();
  return (
    <RadioOptions
      label="Players"
      options={PLAYERS_OPTIONS}
      selected={state.players}
      onSelect={(value) => {
        dispatch({ type: 'SET_PLAYERS', payload: value });
        onPicked?.();
      }}
    />
  );
}

export function SortOptions({ onPicked }: PickProps) {
  const { state, dispatch } = useFilter();
  return (
    <RadioOptions
      label="Sort"
      options={SORT_OPTIONS}
      selected={state.baseSort}
      onSelect={(value) => {
        dispatch({ type: 'SET_SORT', payload: value });
        onPicked?.();
      }}
    />
  );
}

/** Any/All, then every keyword with how many games in view carry it. */
export function KeywordOptions() {
  const { state, dispatch } = useFilter();
  const { items: wishlist } = useWishlistItems();
  // Counts follow the Own/Want toggle: the list a keyword would filter is
  // the one whose tally sits next to it.
  const pool: readonly Filterable[] = state.collection === 'want' ? wishlist : GAMES;
  const allKw = Object.entries(KW) as [KeywordId, string][];

  return (
    <>
      <div className="kw-mode-toggle">
        <button
          type="button"
          className={`kw-mode-btn${state.keywordMode === 'or' ? ' active' : ''}`}
          aria-pressed={state.keywordMode === 'or'}
          onClick={() => dispatch({ type: 'SET_KEYWORD_MODE', payload: 'or' })}
        >
          Any
        </button>
        <button
          type="button"
          className={`kw-mode-btn${state.keywordMode === 'and' ? ' active' : ''}`}
          aria-pressed={state.keywordMode === 'and'}
          onClick={() => dispatch({ type: 'SET_KEYWORD_MODE', payload: 'and' })}
        >
          All
        </button>
      </div>
      <div className="dd-opts">
        {allKw.map(([id, name]) => {
          const sel = state.keywords.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`dd-opt${sel ? ' sel' : ''}`}
              aria-pressed={sel}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: id })}
            >
              <span className="dd-chk">
                {sel && <CheckIcon />}
              </span>
              {name}
              <span className="dd-opt-ct">{pool.filter((g) => g.kw.includes(id)).length}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
