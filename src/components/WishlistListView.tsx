import { useState } from 'react';
import { WISHLIST_TYPES } from '../data/keywords';
import type { WishlistGroup } from '../utils/filterGames';
import GamesTableHead from './GamesTableHead';
import GroupedRows from './GroupedRows';
import WishlistRow, { WISHLIST_COLUMNS } from './WishlistRow';

interface Props {
  groups: WishlistGroup[];
  counts: Record<string, number>;
  myVotes: Set<string>;
  onVote: (id: string) => void;
  disabled: boolean;
}

/** The wishlist as the collection's table, with a vote column. */
export default function WishlistListView({ groups, counts, myVotes, onVote, disabled }: Props) {
  const [openRow, setOpenRow] = useState<string | null>(null);

  return (
    <div className="table-wrap">
      <table className="games-list">
        <GamesTableHead extra={<th className="col-vote"><span className="sr-only">Votes</span></th>} />
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
                onVote={() => onVote(item.id)}
                disabled={disabled}
                isOpen={openRow === item.id}
                onToggle={() => setOpenRow(openRow === item.id ? null : item.id)}
              />
            )}
          />
        </tbody>
      </table>
    </div>
  );
}
