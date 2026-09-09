import type { WishlistItem } from '../data/types';
import { WISHLIST_TYPES } from '../data/keywords';
import { UserIcon, ClockIcon } from './Icons';
import WishlistLinks from './WishlistLinks';
import AwardsBadge from './AwardsBadge';
import VoteButton from './VoteButton';
import OwnButton from './OwnButton';

interface Props {
  item: WishlistItem;
  voteCount: number;
  voted: boolean;
  onVote: () => void;
  disabled?: boolean;
}

export default function WishlistCard({ item, voteCount, voted, onVote, disabled }: Props) {
  return (
    <div className="wish-card" data-testid="wishlist-item" data-item-id={item.id}>
      <span className="wish-lbl">Wishlist</span>
      <h4 className="wish-name">{item.name}</h4>
      <div className="wish-meta">
        {item.players && <span className="wish-players"><UserIcon /> {item.players}</span>}
        {item.dur && <span className="wish-players"><ClockIcon /> {item.dur}</span>}
        {item.suggestedBy && <span className="wish-suggested">Suggested by {item.suggestedBy}</span>}
        {!item.suggestedBy && <span className="wish-type">{WISHLIST_TYPES[item.type]}</span>}
        {!item.suggestedBy && <AwardsBadge itemName={item.name} awards={item.awards} />}
      </div>
      <p className="wish-desc">{item.desc}</p>
      <OwnButton itemId={item.id} itemName={item.name} />
      <div className="wish-footer">
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
