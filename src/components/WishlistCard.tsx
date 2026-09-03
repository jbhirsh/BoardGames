import type { WishlistItem } from '../data/types';
import { ytURL } from '../utils/urls';
import { WISHLIST_TYPES } from '../data/keywords';
import { YouTubeIcon, UserIcon } from './Icons';
import AwardsBadge from './AwardsBadge';
import VoteButton from './VoteButton';

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
        <span className="wish-players"><UserIcon /> {item.players}</span>
        <span className="wish-type">{WISHLIST_TYPES[item.type]}</span>
        <AwardsBadge itemName={item.name} awards={item.awards} />
      </div>
      <p className="wish-desc">{item.desc}</p>
      <div className="wish-footer">
        <VoteButton
          itemName={item.name}
          voteCount={voteCount}
          voted={voted}
          onClick={onVote}
          disabled={disabled}
        />
        <a
          className="wish-yt"
          href={ytURL(item.yt)}
          aria-label={`Watch ${item.name} tutorial on YouTube`}
          onClick={(e) => { e.preventDefault(); window.open(ytURL(item.yt), '_blank'); }}
        >
          <YouTubeIcon />
        </a>
      </div>
    </div>
  );
}
