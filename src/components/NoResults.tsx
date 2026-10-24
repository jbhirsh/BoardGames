import { useFilter } from '../context/useFilter';
import { useWishlistItems } from '../context/useWishlistItems';
import { useFilteredWishlist } from '../context/useFilteredWishlist';
import { COMING_SOON, GAMES } from '../data/games';
import { filterGames, filterWishlist } from '../utils/filterGames';
import { activeFilters, listFilters, relaxations } from '../utils/relaxFilters';
import { focusSection } from '../client/focus';

interface Props {
  /** Which list came up empty; the other one is offered when it has matches. */
  kind: 'games' | 'wishlist';
}

const plural = (n: number) => `${n} ${n === 1 ? 'game' : 'games'}`;
const fit = (n: number) => (n === 1 ? 'fits' : 'fit');

/**
 * Empty state shared by the collection views and the wishlist. It names the
 * filters that emptied the list and offers, for each one that would bring
 * results back on its own, a one-tap way to drop it.
 */
export default function NoResults({ kind }: Props) {
  const { state, dispatch: send, filteredGames } = useFilter();
  // Every action here empties or swaps the list, so this block unmounts and
  // the focused button with it. Hand focus to the heading of the section
  // that shows next, rather than dropping it on the page.
  const dispatch: typeof send = (action) => {
    send(action);
    focusSection();
  };
  const { items } = useWishlistItems();
  const filteredWishlist = useFilteredWishlist();
  const count =
    kind === 'games'
      ? (s: typeof state) => filterGames(GAMES, s).length
      : (s: typeof state) => filterWishlist(items, s).length;
  const filters = activeFilters(state);
  const options = relaxations(state, count).slice(0, 3);
  const otherCount = kind === 'games' ? filteredWishlist.length : filteredGames.length;
  const noun = kind === 'games' ? 'games' : 'wishlist games';
  // Games on their way are listed under the collection, filters and all:
  // when only those match, say so rather than seem to contradict them.
  const arriving = kind === 'games' ? filterGames(COMING_SOON, state).length : 0;

  return (
    <div className="col-span-full rounded-panel border border-border bg-surface px-10 py-16 text-center">
      <p className="mb-4 text-[15px] text-text2">No {noun} match your filters.</p>
      {arriving > 0 && (
        <p className="-mt-2.5 mb-4 text-[13px] text-text2">
          {plural(arriving)} on the way {fit(arriving)}, under Coming Soon below.
        </p>
      )}
      {filters.length > 0 && (
        <p className="-mt-2.5 mb-4 text-[13px] text-text2">Filtering for {listFilters(filters, state.keywordMode)}.</p>
      )}
      {options.length > 0 && (
        <ul className="mb-4 flex flex-wrap justify-center gap-2" aria-label="Loosen the filters">
          {options.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="cursor-pointer rounded-[20px] border border-blue-tint/30 bg-blue-bg px-3.5 py-2 text-[13px] font-semibold text-blue hover:bg-blue-bg2"
                aria-label={`Drop ${r.label}, ${plural(r.count)}`}
                onClick={() => dispatch({ type: 'SET_FILTERS', payload: r.without })}
              >
                Drop {r.label} <span aria-hidden="true">→</span> {plural(r.count)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3.5">
        <button
          type="button"
          className="inline-block cursor-pointer rounded-[20px] bg-blue-fill px-5.5 py-2.25 text-[13px] text-on-fill [transition:background_0.2s] hover:bg-blue-fill-hover"
          onClick={() => dispatch({ type: 'CLEAR_ALL' })}
        >
          Clear filters
        </button>
        {otherCount > 0 && (
          <button
            type="button"
            className="cursor-pointer px-0.5 py-1.5 text-[13px] font-semibold text-blue hover:underline"
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
