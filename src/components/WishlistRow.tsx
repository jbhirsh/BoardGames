import type { WishlistItem } from '../data/types';
import { ytURL } from '../utils/urls';
import { YouTubeIcon } from './Icons';
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
        <h3 className="wish-name">{item.name}</h3>
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
