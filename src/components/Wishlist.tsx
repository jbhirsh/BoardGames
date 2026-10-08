import { useMemo, useRef, useState } from 'react';
import type { WishlistItem } from '../data/types';
import { WISHLIST_TYPES, WISHLIST_TYPE_ORDER } from '../data/keywords';
import WishlistCard from './WishlistCard';
import WishlistListView from './WishlistListView';
import SuggestForm from './SuggestForm';
import CollectionToggle from './CollectionToggle';
import ViewToggle from './ViewToggle';
import NoResults from './NoResults';
import AdminPanel from './AdminPanel';
import { useFilter } from '../context/useFilter';
import { useAuth } from '../context/useAuth';
import { useWishlistItems } from '../context/useWishlistItems';
import { useWishlistVotes } from '../hooks/useWishlistVotes';
import { useKeepSectionInView } from '../hooks/useKeepSectionInView';
import { useIsPhone } from '../hooks/useIsPhone';
import { filterWishlist, isGrouped } from '../utils/filterGames';

/**
 * Takes the reader to the suggestion form, ready to type the game. The
 * button that calls this shows only once the form has mounted.
 */
function goToSuggest() {
  const form = document.getElementById('suggest')!;
  form.scrollIntoView({ block: 'start' });
  form.querySelector('input')!.focus({ preventScroll: true });
}

/**
 * The "We want" view: the static wishlist plus approved friend suggestions,
 * run through the same filter bar as the collection. The body mounts once
 * the suggestions have loaded, because the votes hook needs its id set
 * fixed for life; until then only the header shows, with the
 * count already filtered so a shared URL never flashes the full total.
 * Stays mounted while the collection is showing (just hidden) so nothing
 * refetches on a toggle; only the visible section carries the anchor id.
 */
export default function Wishlist({ hidden = false }: { hidden?: boolean }) {
  const { state } = useFilter();
  const { items, loaded } = useWishlistItems();
  const isPhone = useIsPhone();
  const filtered = useMemo(() => filterWishlist(items, state), [items, state]);
  const sectionRef = useRef<HTMLElement>(null);
  useKeepSectionInView(sectionRef, !hidden);

  return (
    <section className="wishlist" id={hidden ? undefined : 'collection'} ref={sectionRef} hidden={hidden}>
      <div className="sec-hd">
        <h2 className="sec-title" tabIndex={-1}>Wishlist</h2>
        <span className="sec-count">{filtered.length} {filtered.length === 1 ? 'game' : 'games'}</span>
        {/* The wishlist's counterpart to the collection's Pick for us, on
            the heading's line: the form sits below every entry. */}
        {loaded && (
          <button type="button" className="pick-btn" onClick={goToSuggest}>
            Suggest a game
          </button>
        )}
        <div className="sec-switch">
          <CollectionToggle />
          {!isPhone && <ViewToggle />}
        </div>
      </div>
      {loaded && <WishlistBody items={items} filtered={filtered} isPhone={isPhone} />}
    </section>
  );
}

function WishlistBody({ items, filtered, isPhone }: { items: WishlistItem[]; filtered: WishlistItem[]; isPhone: boolean }) {
  const { state } = useFilter();
  const { admin } = useAuth();
  const ids = useMemo(() => items.map((w) => w.id), [items]);
  const { counts, myVotes, toggle, loaded } = useWishlistVotes(ids);

  // The order by votes is taken once and held: when the counts first load,
  // the sort changes or the filtered list does, but not on a vote, so the
  // entry just voted on doesn't jump away from under the pointer (with
  // another landing where the next tap goes). Its button shows the new
  // count either way. Adjusting state during render, React's pattern for
  // state that follows a key.
  const orderKey = `${loaded}|${state.sort}|${filtered.map((w) => w.id).join(',')}`;
  const [order, setOrder] = useState({ key: orderKey, counts });
  if (order.key !== orderKey) setOrder({ key: orderKey, counts });
  const orderCounts = order.key === orderKey ? order.counts : counts;

  // Under the "group" sort, items are grouped by wishlist type with the
  // most-voted first; a column sort clicked on top of it keeps the groups
  // but orders each by that column, as the collection's table does. Every
  // other sort is a flat list in that sort's order.
  const grouped = isGrouped(state);
  const groups = useMemo(() => {
    // Most votes first; the filter left ties in name order.
    if (state.sort === 'votes') {
      return [{ type: null, items: [...filtered].sort((a, b) => (orderCounts[b.id] ?? 0) - (orderCounts[a.id] ?? 0)) }];
    }
    if (!grouped) return [{ type: null, items: filtered }];
    const ordered = state.sort === 'group'
      ? [...filtered].sort((a, b) => (orderCounts[b.id] ?? 0) - (orderCounts[a.id] ?? 0) || a.name.localeCompare(b.name))
      : filtered;
    return WISHLIST_TYPE_ORDER
      .map((type) => ({ type, items: ordered.filter((w) => w.type === type) }))
      .filter((g) => g.items.length > 0);
  }, [filtered, grouped, state.sort, orderCounts]);

  const renderGrid = () => groups.map(({ type, items: groupItems }) => (
    <div className="wish-group" key={type ?? 'all'}>
      {type && <h3 className="group-hd">{WISHLIST_TYPES[type]}</h3>}
      <div className="games-grid wish-grid">
        {groupItems.map((item) => (
          <WishlistCard
            key={item.id}
            item={item}
            headingLevel={grouped ? 4 : 3}
            voteCount={counts[item.id] ?? 0}
            voted={myVotes.has(item.id)}
            onVote={() => toggle(item.id)}
            disabled={!loaded}
          />
        ))}
      </div>
    </div>
  ));

  return (
    <>
      {admin && <AdminPanel />}
      {filtered.length === 0 ? (
        <NoResults kind="wishlist" />
      ) : state.view === 'list' && !isPhone ? (
        <WishlistListView groups={groups} counts={counts} myVotes={myVotes} onVote={toggle} disabled={!loaded} />
      ) : (
        renderGrid()
      )}
      <SuggestForm />
    </>
  );
}
