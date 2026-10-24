import { useCallback, useState } from 'react';
import { WISHLIST_TYPES } from '../data/keywords';
import type { WishlistGroup } from '../utils/filterGames';
import WishLine from './WishLine';
import { groupHeadingClass, linesClass, wishGroupClass } from './sharedClasses';

interface Props {
  groups: WishlistGroup[];
  counts: Record<string, number>;
  myVotes: Set<string>;
  onVote: (id: string) => void;
  disabled: boolean;
}

/**
 * The wishlist's list on a phone, a WishLine an entry, under the group
 * headings its grid uses. As in the desktop table (WishlistListView), its
 * lines link only to other sites, so the open one is plain local state.
 */
export default function WishlistPhoneListView({ groups, counts, myVotes, onVote, disabled }: Props) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  // One toggle for every line, so the lines a change leaves alone stay as drawn.
  const toggleRow = useCallback((id: string) => setOpenRow((open) => (open === id ? null : id)), []);

  return groups.map(({ key, items }) => (
    <div className={`wish-group ${wishGroupClass}`} key={key ?? 'all'}>
      {key && <h3 className={groupHeadingClass}>{WISHLIST_TYPES[key]}</h3>}
      <ul className={linesClass}>
        {items.map((item) => (
          <WishLine
            key={item.id}
            item={item}
            headingLevel={key ? 4 : 3}
            voteCount={counts[item.id] ?? 0}
            voted={myVotes.has(item.id)}
            onVote={onVote}
            disabled={disabled}
            isOpen={openRow === item.id}
            onToggle={toggleRow}
          />
        ))}
      </ul>
    </div>
  ));
}
