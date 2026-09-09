import type { KeywordId, WishlistItem } from '../data/types';
import { isKeywordLit } from '../utils/keywordLit';
import { useFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import { UserIcon, ClockIcon } from './Icons';
import KeywordPill from './KeywordPill';
import WishlistLinks from './WishlistLinks';
import AwardsBadge from './AwardsBadge';
import VoteButton from './VoteButton';
import AdminItemControls from './AdminItemControls';

interface Props {
  item: WishlistItem;
  voteCount: number;
  voted: boolean;
  onVote: () => void;
  disabled?: boolean;
  /** h4 under a group heading, h3 in a flat list, so heading levels never skip. */
  headingLevel?: 3 | 4;
}

/** A wishlist entry in the grid: the collection's card, with a vote and buy links where Rules would be. */
export default function WishlistCard({ item, voteCount, voted, onVote, disabled, headingLevel = 4 }: Props) {
  const { state, dispatch } = useFilter();
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const lit = (kw: KeywordId) => isKeywordLit(state, kw);

  return (
    <div className="game-card wish-card" data-testid="wishlist-item" data-item-id={item.id}>
      <div className={`card-head${item.img ? '' : ' no-art'}`}>
        {item.img && <img src={item.img} alt={`${item.name} box art`} className="card-corner-img" loading="lazy" />}
        <Heading className="card-name">{item.name}</Heading>
        <div className="card-meta">
          {item.players && <span className="cmeta"><UserIcon /> {item.players}</span>}
          {item.dur && <span className="cmeta"><ClockIcon /> {item.dur}</span>}
          <AwardsBadge itemName={item.name} awards={item.awards} />
        </div>
        {item.kw.length > 0 && (
          <div className="card-kw">
            {sortedKw(item.kw).map((kw) => (
              <KeywordPill
                key={kw}
                keyword={kw as KeywordId}
                active={lit(kw as KeywordId)}
                onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw as KeywordId })}
              />
            ))}
          </div>
        )}
      </div>
      <div className="card-body">
        <p className="card-desc">{item.desc}</p>
        {item.suggestedBy && <p className="card-credit">Suggested by {item.suggestedBy}</p>}
        <AdminItemControls item={item} />
      </div>
      <div className="card-foot">
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
