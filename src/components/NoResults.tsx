import { useFilter } from '../context/useFilter';
import { useWishlistItems } from '../context/useWishlistItems';
import { GAMES } from '../data/games';
import { filterGames, filterWishlist } from '../utils/filterGames';
import { activeFilters, listFilters, relaxations } from '../utils/relaxFilters';

interface Props {
  /** Which list came up empty; the other one is offered when it has matches. */
  kind: 'games' | 'wishlist';
}

const plural = (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`;
const fit = (n: number) => (n === 1 ? 'fits' : 'fit');

/**
 * Every action here empties or swaps the list, so this block unmounts and
 * the focused button with it. Hand focus to the heading of the section that
 * shows next, rather than dropping it on the page.
 */
function focusSection() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('#collection .sec-title')?.focus());
}

/**
 * Empty state shared by the collection views and the wishlist. It names the
 * filters that emptied the list and offers, for each one that would bring
 * results back on its own, a one-tap way to drop it.
 */
export default function NoResults({ kind }: Props) {
  const { state, dispatch: send } = useFilter();
  const dispatch: typeof send = (action) => { send(action); focusSection(); };
  const { items } = useWishlistItems();
  const count = kind === 'games'
    ? (s: typeof state) => filterGames(GAMES, s).length
    : (s: typeof state) => filterWishlist(items, s).length;
  const filters = activeFilters(state);
  const options = relaxations(state, count).slice(0, 3);
  const otherCount = kind === 'games' ? filterWishlist(items, state).length : filterGames(GAMES, state).length;
  const noun = kind === 'games' ? 'games' : 'wishlist games';

  return (
    <div className="no-results">
      <p>No {noun} match your filters.</p>
      {filters.length > 0 && <p className="no-results-which">Filtering for {listFilters(filters, state.keywordMode)}.</p>}
      {options.length > 0 && (
        <ul className="no-results-options" aria-label="Loosen the filters">
          {options.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="no-results-opt"
                aria-label={`Drop ${r.label}, ${plural(r.count)}`}
                onClick={() => dispatch({ type: 'HYDRATE', payload: r.without })}
              >
                Drop {r.label} <span aria-hidden="true">→</span> {plural(r.count)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="no-results-actions">
        <button type="button" className="no-results-btn" onClick={() => dispatch({ type: 'CLEAR_ALL' })}>Clear filters</button>
        {otherCount > 0 && (
          <button
            type="button"
            className="no-results-other"
            onClick={() => dispatch({ type: 'SET_COLLECTION', payload: kind === 'games' ? 'want' : 'own' })}
          >
            {kind === 'games'
              ? `${plural(otherCount)} on the wishlist ${fit(otherCount)}`
              : `${plural(otherCount)} we own ${fit(otherCount)}`}
          </button>
        )}
      </div>
    </div>
  );
}
