import { useCallback, useState } from 'react';
import { WISHLIST_TYPES } from '../data/keywords';
import type { WishlistGroup } from '../utils/filterGames';
import GamesTableHead from './GamesTableHead';
import GroupedRows from './GroupedRows';
import WishlistRow, { WISHLIST_COLUMNS } from './WishlistRow';
import { headCellClass, tableClass, tableWrapClass } from './tableClasses';

interface Props {
  groups: WishlistGroup[];
  counts: Record<string, number>;
  myVotes: Set<string>;
  onVote: (id: string) => void;
  disabled: boolean;
}

/**
 * The wishlist as the collection's table (GamesTableHead, GroupedRows),
 * with a vote column and an expanded row for the full blurb, awards, owner
 * controls and links; a collapsed row shows the blurb's first sentence
 * (shortDesc) where a collection row has its hand-written short line. Its
 * rows link only to other sites, in new tabs, so the open row is plain
 * local state rather than the history entry's (useOpenRow).
 */
export default function WishlistListView({ groups, counts, myVotes, onVote, disabled }: Props) {
  const [openRow, setOpenRow] = useState<string | null>(null);
  // One toggle for every row, so the rows a change leaves alone stay as drawn.
  const toggleRow = useCallback((id: string) => setOpenRow((open) => (open === id ? null : id)), []);

  return (
    <div className={tableWrapClass}>
      <table className={tableClass}>
        <GamesTableHead
          extra={
            <th className={`col-vote ${headCellClass} w-[1%] sm:max-xl:w-22.5`}>
              <span className="sr-only">Votes</span>
            </th>
          }
        />
        <tbody>
          <GroupedRows
            groups={groups}
            labels={WISHLIST_TYPES}
            columns={WISHLIST_COLUMNS}
            row={(item) => (
              <WishlistRow
                key={item.id}
                item={item}
                voteCount={counts[item.id] ?? 0}
                voted={myVotes.has(item.id)}
                onVote={onVote}
                disabled={disabled}
                isOpen={openRow === item.id}
                onToggle={toggleRow}
              />
            )}
          />
        </tbody>
      </table>
    </div>
  );
}
