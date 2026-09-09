import { useMemo, useRef } from 'react';
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
import { filterWishlist, isGrouped } from '../utils/filterGames';

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
  const filtered = useMemo(() => filterWishlist(items, state), [items, state]);
  const sectionRef = useRef<HTMLElement>(null);
  useKeepSectionInView(sectionRef, !hidden);

  return (
    <section className="wishlist" id={hidden ? undefined : 'collection'} ref={sectionRef} hidden={hidden}>
      <div className="sec-hd">
        <h2 className="sec-title">Wishlist</h2>
        <span className="sec-count">{filtered.length} games</span>
        <div className="sec-right">
          <CollectionToggle />
          <ViewToggle />
        </div>
      </div>
      {loaded && <WishlistBody items={items} filtered={filtered} />}
    </section>
  );
}

function WishlistBody({ items, filtered }: { items: WishlistItem[]; filtered: WishlistItem[] }) {
  const { state } = useFilter();
  const { admin } = useAuth();
  const ids = useMemo(() => items.map((w) => w.id), [items]);
  const { counts, myVotes, toggle, loaded } = useWishlistVotes(ids);

  // Under the "group" sort, items are grouped by wishlist type with the
  // most-voted first; a column sort clicked on top of it keeps the groups
  // but orders each by that column, as the collection's table does. Every
  // other sort is a flat list in that sort's order.
  const grouped = isGrouped(state);
  const groups = useMemo(() => {
    if (!grouped) return [{ type: null, items: filtered }];
    const ordered = state.sort === 'group'
      ? [...filtered].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.name.localeCompare(b.name))
      : filtered;
    return WISHLIST_TYPE_ORDER
      .map((type) => ({ type, items: ordered.filter((w) => w.type === type) }))
      .filter((g) => g.items.length > 0);
  }, [filtered, grouped, state.sort, counts]);

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
        <NoResults message="No wishlist games match your filters." />
      ) : state.view === 'list' ? (
        <WishlistListView groups={groups} counts={counts} myVotes={myVotes} onVote={toggle} disabled={!loaded} />
      ) : (
        renderGrid()
      )}
      <SuggestForm />
    </>
  );
}
