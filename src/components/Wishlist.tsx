import { useMemo } from 'react';
import { WISHLIST } from '../data/wishlist';
import { WISHLIST_TYPES, WISHLIST_TYPE_ORDER } from '../data/keywords';
import WishlistCard from './WishlistCard';
import WishlistRow from './WishlistRow';
import { useFilter } from '../context/useFilter';
import { useWishlistVotes } from '../hooks/useWishlistVotes';

const WISHLIST_IDS = WISHLIST.map((w) => w.id);
const ORIGINAL_INDEX = new Map(WISHLIST.map((w, i) => [w.id, i]));

export default function Wishlist() {
  const { state } = useFilter();
  const { counts, myVotes, toggle, loaded } = useWishlistVotes(WISHLIST_IDS);

  // Group by type; within a group, most-voted first, then original order.
  const groups = useMemo(() => {
    const sorted = [...WISHLIST].sort((a, b) => {
      const ca = counts[a.id] ?? 0;
      const cb = counts[b.id] ?? 0;
      if (cb !== ca) return cb - ca;
      return (ORIGINAL_INDEX.get(a.id) ?? 0) - (ORIGINAL_INDEX.get(b.id) ?? 0);
    });
    return WISHLIST_TYPE_ORDER
      .map((type) => ({ type, items: sorted.filter((w) => w.type === type) }))
      .filter((g) => g.items.length > 0);
  }, [counts]);

  return (
    <section className="wishlist">
      <div className="sec-hd">
        <h2 className="sec-title">Wishlist</h2>
        <span className="sec-count">{WISHLIST.length} titles</span>
      </div>
      {groups.map(({ type, items }) => (
        <div className="wish-group" key={type}>
          <h3 className="wish-group-hd">{WISHLIST_TYPES[type]}</h3>
          {state.view === 'list' ? (
            <div className="wish-list">
              {items.map((item) => (
                <WishlistRow
                  key={item.id}
                  item={item}
                  voteCount={counts[item.id] ?? 0}
                  voted={myVotes.has(item.id)}
                  onVote={() => toggle(item.id)}
                  disabled={!loaded}
                />
              ))}
            </div>
          ) : (
            <div className="wish-grid">
              {items.map((item) => (
                <WishlistCard
                  key={item.id}
                  item={item}
                  voteCount={counts[item.id] ?? 0}
                  voted={myVotes.has(item.id)}
                  onVote={() => toggle(item.id)}
                  disabled={!loaded}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
