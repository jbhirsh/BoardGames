import { useMemo, useRef, useState } from 'react';
import type { WishlistItem } from '../data/types';
import { WISHLIST_TYPES, WISHLIST_TYPE_ORDER } from '../data/keywords';
import WishlistCard from './WishlistCard';
import WishlistListView from './WishlistListView';
import WishlistPhoneListView from './WishlistPhoneListView';
import SuggestForm from './SuggestForm';
import CollectionToggle from './CollectionToggle';
import ViewToggle from './ViewToggle';
import ViewFlip from './ViewFlip';
import NoResults from './NoResults';
import AdminPanel from './AdminPanel';
import { useFilterResults } from '../context/useFilter';
import { useFilteredWishlist } from '../context/useFilteredWishlist';
import { useAuth } from '../context/useAuth';
import { useWishlistItems } from '../context/useWishlistItems';
import { useWishlistVotes } from '../hooks/useWishlistVotes';
import { useKeepSectionInView } from '../hooks/useKeepSectionInView';
import { useIsPhone } from '../hooks/useIsPhone';
import { useCopyLink } from '../hooks/useCopyLink';
import { groupItems, isGrouped, type WishlistGroup } from '../utils/filterGames';
import { buildShareUrl } from '../utils/filterUrl';
import { initialFilterState } from '../data/initialFilterState';
import { goToSuggest } from '../client/suggest';
import { DoneIcon, ShareIcon } from './Icons';

/**
 * The "We want" view: the static wishlist plus approved friend suggestions,
 * run through the same filter bar as the collection. The body mounts once
 * the suggestions have loaded, because the votes hook needs its id set
 * fixed for life; until then only the header shows, with the
 * count already filtered so a shared URL never flashes the full total.
 * Stays mounted while the collection is showing (just hidden) so nothing
 * refetches on a toggle; only the visible section carries the anchor id.
 *
 * It wears the collection's clothes (WishlistCard, WishlistListView) and
 * adds what a list to vote on needs: a "Most votes" sort (`votes`, the
 * wishlist's alone; the filter orders it A→Z and this puts the most voted
 * first, and the other list, or a s=votes link without c=want, falls back
 * to the default sort), a line under the heading saying what a vote does,
 * and on the heading's line Share wishlist (/?c=want, through useCopyLink)
 * and Suggest a game, which jumps to the form at the bottom. On a phone the
 * heading's line ends in two quiet icon buttons, Share and the rows-or-cards
 * switch (ViewFlip), and Suggest a game and Own/Want are in the bar along
 * the bottom (PhoneNav).
 */
export default function Wishlist({ hidden = false }: { hidden?: boolean }) {
  const { items, loaded } = useWishlistItems();
  const isPhone = useIsPhone();
  const filtered = useFilteredWishlist();
  const sectionRef = useRef<HTMLElement>(null);
  useKeepSectionInView(sectionRef, !hidden);
  // The Share link's copy, with the wishlist's own URL: /?c=want, none of
  // the filters, so a friend sees every entry.
  const { copied, copy } = useCopyLink();
  const shareLink = () => copy(buildShareUrl({ ...initialFilterState, collection: 'want' }, window.location.origin));
  // data-label sizes the button to its longer label, so "Copied!" doesn't
  // shrink it (see .share-btn::before). On a phone, an icon, which turns to
  // a tick and "Copied" for a moment.
  const share = isPhone ? (
    <button type="button" className="icon-btn" aria-label="Share wishlist" title="Share wishlist" onClick={shareLink}>
      {copied ? (
        <>
          <DoneIcon />
          <span className="icon-btn-note">Copied</span>
        </>
      ) : (
        <ShareIcon />
      )}
    </button>
  ) : (
    <button type="button" className="share-btn" data-label="Share wishlist" onClick={shareLink}>
      <span className="share-btn-label">{copied ? 'Copied!' : 'Share wishlist'}</span>
    </button>
  );

  return (
    <section className="wishlist" id={hidden ? undefined : 'collection'} ref={sectionRef} hidden={hidden}>
      <div className="sec-hd">
        <div className="sec-name">
          <h2 className="sec-title" tabIndex={-1} data-focus-target="title">
            Wishlist
          </h2>
          <span className="sec-count">
            {filtered.length} {filtered.length === 1 ? 'game' : 'games'}
          </span>
        </div>
        {/* The wishlist's counterpart to the collection's Pick for us, on
            the heading's line: the form sits below every entry. */}
        {loaded && !isPhone && (
          <div className="sec-actions">
            {share}
            <button type="button" className="pick-btn" onClick={goToSuggest}>
              Suggest a game
            </button>
          </div>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {copied ? 'Link copied to clipboard' : ''}
        </span>
        <div className="sec-switch">
          {!isPhone && <CollectionToggle />}
          {loaded && isPhone && share}
          {isPhone ? <ViewFlip /> : <ViewToggle />}
        </div>
      </div>
      {/* What a vote does, for the friend a shared link brought here. */}
      <p className="wish-purpose">Heart the games you'd play. The top pick is what we buy next.</p>
      {loaded && <WishlistBody items={items} filtered={filtered} isPhone={isPhone} />}
    </section>
  );
}

function WishlistBody({
  items,
  filtered,
  isPhone,
}: {
  items: WishlistItem[];
  filtered: WishlistItem[];
  isPhone: boolean;
}) {
  const { state } = useFilterResults();
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
  const groups = useMemo((): WishlistGroup[] => {
    // Most votes first; the filter left ties in name order.
    if (state.sort === 'votes') {
      return [{ key: null, items: [...filtered].sort((a, b) => (orderCounts[b.id] ?? 0) - (orderCounts[a.id] ?? 0)) }];
    }
    if (!grouped) return [{ key: null, items: filtered }];
    const ordered =
      state.sort === 'group'
        ? [...filtered].sort(
            (a, b) => (orderCounts[b.id] ?? 0) - (orderCounts[a.id] ?? 0) || a.name.localeCompare(b.name),
          )
        : filtered;
    return groupItems(ordered, WISHLIST_TYPE_ORDER, (w) => w.type);
  }, [filtered, grouped, state.sort, orderCounts]);

  const renderGrid = () =>
    groups.map(({ key, items: entries }) => (
      <div className="wish-group" key={key ?? 'all'}>
        {key && <h3 className="group-hd">{WISHLIST_TYPES[key]}</h3>}
        <div className="games-grid wish-grid">
          {entries.map((item) => (
            <WishlistCard
              key={item.id}
              item={item}
              headingLevel={grouped ? 4 : 3}
              voteCount={counts[item.id] ?? 0}
              voted={myVotes.has(item.id)}
              onVote={toggle}
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
      ) : state.view === 'grid' ? (
        renderGrid()
      ) : isPhone ? (
        <WishlistPhoneListView groups={groups} counts={counts} myVotes={myVotes} onVote={toggle} disabled={!loaded} />
      ) : (
        <WishlistListView groups={groups} counts={counts} myVotes={myVotes} onVote={toggle} disabled={!loaded} />
      )}
      <SuggestForm />
    </>
  );
}
