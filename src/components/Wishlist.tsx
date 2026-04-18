import { useMemo } from 'react';
import { WISHLIST } from '../data/wishlist';
import WishlistCard from './WishlistCard';
import WishlistRow from './WishlistRow';
import { useFilter } from '../context/useFilter';
import { useWishlistVotes } from '../hooks/useWishlistVotes';

const WISHLIST_IDS = WISHLIST.map((w) => w.id);
const ORIGINAL_INDEX = new Map(WISHLIST.map((w, i) => [w.id, i]));

export default function Wishlist() {
  const { state } = useFilter();
  const { counts, myVotes, toggle, loaded } = useWishlistVotes(WISHLIST_IDS);

  const sorted = useMemo(() => {
    return [...WISHLIST].sort((a, b) => {
      const ca = counts[a.id] ?? 0;
      const cb = counts[b.id] ?? 0;
      if (cb !== ca) return cb - ca;
      return (ORIGINAL_INDEX.get(a.id) ?? 0) - (ORIGINAL_INDEX.get(b.id) ?? 0);
    });
  }, [counts]);

  return (
    <section className="wishlist">
      <div className="sec-hd">
        <h2 className="sec-title">Wishlist</h2>
        <span className="sec-count">{WISHLIST.length} titles</span>
      </div>
      {state.view === 'list' ? (
        <div className="wish-list">
          {sorted.map((item) => (
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
          {sorted.map((item) => (
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
    </section>
  );
}
