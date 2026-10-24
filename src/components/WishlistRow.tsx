import { memo } from 'react';
import type { WishlistItem } from '../data/types';
import { AwardsSection } from './AwardsBadge';
import WishlistLinks from './WishlistLinks';
import VoteButton from './VoteButton';
import ExpansionTag from './ExpansionTag';
import AdminItemControls from './AdminItemControls';
import { TABLE_COLUMNS } from './GamesTableHead';
import TableRowCells, { TableRowExpand } from './TableRowCells';
import { shortDesc } from '../utils/shortDesc';
import { wishAnchor } from '../utils/heroCovers';
import { detailSectionClass, detailTextClass, rowFootClass } from './sharedClasses';
import { cellClass } from './tableClasses';

/** The shared columns plus the vote column. */
export const WISHLIST_COLUMNS = TABLE_COLUMNS + 1;

interface Props {
  item: WishlistItem;
  voteCount: number;
  voted: boolean;
  /** Called with the entry's id, as onToggle is, so one callback serves every row. */
  onVote: (id: string) => void;
  disabled?: boolean;
  isOpen: boolean;
  onToggle: (id: string) => void;
}

/**
 * A wishlist entry in the list: the collection's table row, with a vote
 * column, and the buy and video links in the expanded section. Memoized: a
 * filter change that leaves this entry as it was doesn't redraw it.
 */
export default memo(WishlistRow);

function WishlistRow({ item, voteCount, voted, onVote, disabled, isOpen, onToggle: toggleRow }: Props) {
  const onToggle = () => toggleRow(item.id);
  return (
    <>
      <tr
        id={wishAnchor(item.id)}
        className={`game-row group/row cursor-pointer scroll-mt-[calc(var(--thead-top,91px)+48px)] ${isOpen ? 'open' : ''}`}
        onClick={onToggle}
        data-testid="wishlist-item"
        data-item-id={item.id}
      >
        <TableRowCells
          name={item.name}
          players={item.players}
          dur={item.dur}
          mins={item.mins}
          short={shortDesc(item.desc)}
          kw={item.kw}
          awards={item.awards}
          subTag={item.expands && <ExpansionTag base={item.expands} wrap />}
          isOpen={isOpen}
          onToggle={onToggle}
          extra={
            <td className={`col-vote ${cellClass(isOpen)} w-[1%] text-right whitespace-nowrap`}>
              <VoteButton
                itemName={item.name}
                voteCount={voteCount}
                voted={voted}
                onClick={(e) => {
                  e.stopPropagation();
                  onVote(item.id);
                }}
                disabled={disabled}
                inTable
              />
            </td>
          }
        />
      </tr>
      <TableRowExpand colSpan={WISHLIST_COLUMNS} isOpen={isOpen}>
        <div className={detailSectionClass}>
          {item.img && (
            <img
              src={item.img}
              alt={`${item.name} box art`}
              className="row-art float-right mb-2 ml-3.5 size-16 rounded-xl border border-border bg-art-matte object-cover filter-(--art-dim)"
              loading="lazy"
            />
          )}
          <p className={detailTextClass}>{item.desc}</p>
          {item.suggestedBy && (
            <p className={`row-credit mt-1.5 ${detailTextClass}`}>Suggested by {item.suggestedBy}</p>
          )}
        </div>
        <AwardsSection awards={item.awards} />
        <AdminItemControls item={item} />
        <div className={rowFootClass}>
          <WishlistLinks item={item} />
        </div>
      </TableRowExpand>
    </>
  );
}
