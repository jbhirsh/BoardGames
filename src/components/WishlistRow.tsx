import type { WishlistItem } from '../data/types';
import { WISHLIST_TYPES } from '../data/keywords';
import { UserIcon } from './Icons';
import WishlistLinks from './WishlistLinks';
import AwardsBadge from './AwardsBadge';
import VoteButton from './VoteButton';

interface Props {
  item: WishlistItem;
  voteCount: number;
  voted: boolean;
  onVote: () => void;
  disabled?: boolean;
}

export default function WishlistRow({ item, voteCount, voted, onVote, disabled }: Props) {
  return (
    <div className="wish-row" data-testid="wishlist-item" data-item-id={item.id}>
      <div className="wish-row-main">
        <h4 className="wish-name">{item.name}</h4>
        <div className="wish-meta">
          <span className="wish-players"><UserIcon /> {item.players}</span>
          <span className="wish-type">{WISHLIST_TYPES[item.type]}</span>
          <AwardsBadge itemName={item.name} awards={item.awards} />
        </div>
        <p className="wish-desc">{item.desc}</p>
      </div>
      <div className="wish-row-actions">
        <VoteButton
          itemName={item.name}
          voteCount={voteCount}
          voted={voted}
          onClick={onVote}
          disabled={disabled}
        />
        <WishlistLinks item={item} />
      </div>
    </div>
  );
}
