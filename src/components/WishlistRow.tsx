import type { WishlistItem } from '../data/types';
import { AwardsList } from './AwardsBadge';
import WishlistLinks from './WishlistLinks';
import VoteButton from './VoteButton';
import AdminItemControls from './AdminItemControls';
import { TABLE_COLUMNS } from './GamesTableHead';
import TableRowCells, { TableRowExpand } from './TableRowCells';
import { shortDesc } from '../utils/shortDesc';

/** The shared columns plus the vote column. */
export const WISHLIST_COLUMNS = TABLE_COLUMNS + 1;

interface Props {
  item: WishlistItem;
  voteCount: number;
  voted: boolean;
  onVote: () => void;
  disabled?: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * A wishlist entry in the list: the collection's table row, with a vote
 * column, and the buy and video links in the expanded section.
 */
export default function WishlistRow({ item, voteCount, voted, onVote, disabled, isOpen, onToggle }: Props) {
  return (
    <>
      <tr className={`game-row${isOpen ? ' open' : ''}`} onClick={onToggle} data-testid="wishlist-item" data-item-id={item.id}>
        <TableRowCells
          name={item.name}
          players={item.players}
          cat={item.cat}
          dur={item.dur}
          short={shortDesc(item.desc)}
          kw={item.kw}
          awards={item.awards}
          isOpen={isOpen}
          onToggle={onToggle}
          extra={(
            <td className="col-vote">
              <VoteButton
                itemName={item.name}
                voteCount={voteCount}
                voted={voted}
                onClick={(e) => { e.stopPropagation(); onVote(); }}
                disabled={disabled}
              />
            </td>
          )}
        />
      </tr>
      <TableRowExpand colSpan={WISHLIST_COLUMNS} isOpen={isOpen}>
        <div className="detail-section">
          {item.img && <img src={item.img} alt={`${item.name} box art`} className="row-art" loading="lazy" />}
          <p>{item.desc}</p>
          {item.suggestedBy && <p className="row-credit">Suggested by {item.suggestedBy}</p>}
        </div>
        {item.awards.length > 0 && (
          <div className="detail-section row-awards">
            <h3>Awards</h3>
            <AwardsList awards={item.awards} />
          </div>
        )}
        <AdminItemControls item={item} />
        <div className="row-expand-foot">
          <WishlistLinks item={item} />
        </div>
      </TableRowExpand>
    </>
  );
}
