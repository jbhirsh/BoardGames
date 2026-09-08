import { useMemo } from 'react';
import type { WishlistItem } from '../data/types';
import { WISHLIST } from '../data/wishlist';
import { WISHLIST_TYPES, WISHLIST_TYPE_ORDER } from '../data/keywords';
import WishlistCard from './WishlistCard';
import WishlistRow from './WishlistRow';
import SuggestForm from './SuggestForm';
import { useFilter } from '../context/useFilter';
import { OwnersProvider } from '../context/OwnersContext';
import { useWishlistVotes } from '../hooks/useWishlistVotes';
import { useSuggestions } from '../hooks/useSuggestions';

/**
 * Loads approved friend suggestions first, then mounts the body with the
 * full id set: the votes and owners hooks need their ids fixed for life, so
 * the body waits (showing just the header) rather than remounting later.
 */
export default function Wishlist() {
  const { items: suggested, loaded } = useSuggestions();
  const items = useMemo(() => [...WISHLIST, ...suggested], [suggested]);
  if (!loaded) {
    return (
      <section className="wishlist">
        <WishlistHeader count={WISHLIST.length} />
      </section>
    );
  }
  return <WishlistBody items={items} />;
}

function WishlistHeader({ count }: { count: number }) {
  return (
    <div className="sec-hd">
      <h2 className="sec-title">Wishlist</h2>
      <span className="sec-count">{count} titles</span>
    </div>
  );
}

function WishlistBody({ items }: { items: WishlistItem[] }) {
  const { state } = useFilter();
  const ids = useMemo(() => items.map((w) => w.id), [items]);
  const originalIndex = useMemo(() => new Map(items.map((w, i) => [w.id, i])), [items]);
  const { counts, myVotes, toggle, loaded } = useWishlistVotes(ids);

  // Group by type; within a group, most-voted first, then original order.
  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const ca = counts[a.id] ?? 0;
      const cb = counts[b.id] ?? 0;
      if (cb !== ca) return cb - ca;
      return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
    });
    return WISHLIST_TYPE_ORDER
      .map((type) => ({ type, items: sorted.filter((w) => w.type === type) }))
      .filter((g) => g.items.length > 0);
  }, [counts, items, originalIndex]);

  return (
    <section className="wishlist">
      <WishlistHeader count={items.length} />
      <OwnersProvider ids={ids}>
        {groups.map(({ type, items: groupItems }) => (
          <div className="wish-group" key={type}>
            <h3 className="wish-group-hd">{WISHLIST_TYPES[type]}</h3>
            {state.view === 'list' ? (
              <div className="wish-list">
                {groupItems.map((item) => (
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
                {groupItems.map((item) => (
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
      </OwnersProvider>
      <SuggestForm />
    </section>
  );
}
