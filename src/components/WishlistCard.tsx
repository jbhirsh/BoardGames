import { useId, useState } from 'react';
import type { KeywordId, WishlistItem } from '../data/types';
import { shortDesc } from '../utils/shortDesc';
import { isKeywordLit } from '../utils/keywordLit';
import { useFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import { UserIcon, ClockIcon } from './Icons';
import KeywordPill from './KeywordPill';
import WishlistLinks from './WishlistLinks';
import AwardsBadge from './AwardsBadge';
import VoteButton from './VoteButton';
import AdminItemControls from './AdminItemControls';
import ExpansionTag from './ExpansionTag';

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
  // The card opens on the blurb's first sentence, as the list row does, and
  // More shows the rest.
  const [moreOpen, setMoreOpen] = useState(false);
  const descId = useId();
  const short = shortDesc(item.desc);
  const hasMore = short !== item.desc.trim();

  return (
    <div className="game-card wish-card" data-testid="wishlist-item" data-item-id={item.id}>
      <div className={`card-head${item.img ? '' : ' no-art'}`}>
        {item.img && <img src={item.img} alt={`${item.name} box art`} className="card-corner-img" loading="lazy" />}
        <Heading className="card-name">{item.name}</Heading>
        <div className="card-meta">
          {item.players && <span className="cmeta"><UserIcon /> {item.players}</span>}
          {item.dur && <span className="cmeta"><ClockIcon /> {item.dur}</span>}
        </div>
        {item.expands && <p className="card-expands"><ExpansionTag base={item.expands} /></p>}
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
        <p className="card-desc" id={descId}>
          {moreOpen || !hasMore ? item.desc : short}
          {hasMore && (
            <>
              {' '}
              <button
                type="button"
                className="card-more"
                aria-expanded={moreOpen}
                aria-controls={descId}
                aria-label={`${moreOpen ? 'Less' : 'More'} about ${item.name}`}
                onClick={() => setMoreOpen((o) => !o)}
              >
                {moreOpen ? 'Less' : 'More'}
              </button>
            </>
          )}
        </p>
        {item.suggestedBy && <p className="card-credit">Suggested by {item.suggestedBy}</p>}
        <AdminItemControls item={item} />
      </div>
      <div className="card-foot">
        <div className="card-foot-start">
          <AwardsBadge itemName={item.name} awards={item.awards} />
        </div>
        <div className="card-foot-end">
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
    </div>
  );
}
