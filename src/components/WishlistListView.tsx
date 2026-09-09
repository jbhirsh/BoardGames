import { Fragment, useState } from 'react';
import type { WishlistItem, WishlistType } from '../data/types';
import { WISHLIST_TYPES } from '../data/keywords';
import GamesTableHead from './GamesTableHead';
import WishlistRow, { WISHLIST_COLUMNS } from './WishlistRow';

export interface WishlistGroup {
  /** null for the flat, ungrouped list. */
  type: WishlistType | null;
  items: WishlistItem[];
}

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
          {groups.map(({ type, items }) => (
            <Fragment key={type ?? 'all'}>
              {type && (
                <tr className="list-group-row">
                  <td colSpan={WISHLIST_COLUMNS}>{WISHLIST_TYPES[type]}</td>
                </tr>
              )}
              {items.map((item) => (
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
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
