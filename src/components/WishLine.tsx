import { memo } from 'react';
import type { WishlistItem } from '../data/types';
import { useFilterDispatch, useItemFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import { shortDesc } from '../utils/shortDesc';
import { wishAnchor } from '../utils/heroCovers';
import PhoneLine from './PhoneLine';
import VoteButton from './VoteButton';
import KeywordPill from './KeywordPill';
import ExpansionTag from './ExpansionTag';
import { AwardsSection } from './AwardsBadge';
import AdminItemControls from './AdminItemControls';
import WishlistLinks from './WishlistLinks';
import { creditClass, rowFootClass, tagsClass } from './sharedClasses';

interface Props {
  item: WishlistItem;
  voteCount: number;
  voted: boolean;
  /** Called with the entry's id, as onToggle is, so one callback serves every line. */
  onVote: (id: string) => void;
  disabled?: boolean;
  isOpen: boolean;
  onToggle: (id: string) => void;
  headingLevel: 3 | 4;
}

/**
 * A wishlist entry on a phone's list: its vote on the line, compact, and
 * open, the rest of what its card shows (the blurb, the base game an
 * expansion needs, who suggested it, its tags and awards, the owner's
 * controls) over the buy and video links. Memoized: a filter change that
 * leaves this entry as it was doesn't redraw it.
 */
export default memo(WishLine);

function WishLine({ item, voteCount, voted, onVote, disabled, isOpen, onToggle, headingLevel }: Props) {
  const { lit } = useItemFilter();
  const dispatch = useFilterDispatch();
  return (
    <PhoneLine
      id={wishAnchor(item.id)}
      img={item.img}
      name={item.name}
      headingLevel={headingLevel}
      meta={[item.players, item.dur].filter(Boolean).join(' · ') || shortDesc(item.desc)}
      action={
        <VoteButton
          compact
          itemName={item.name}
          voteCount={voteCount}
          voted={voted}
          onClick={() => onVote(item.id)}
          disabled={disabled}
        />
      }
      isOpen={isOpen}
      onToggle={() => onToggle(item.id)}
      data={{ 'data-testid': 'wishlist-item', 'data-item-id': item.id }}
    >
      <p className="mb-2.5 text-[14px] leading-[1.55] text-text2">{item.desc}</p>
      {item.expands && (
        <p className="mb-2.5">
          <ExpansionTag base={item.expands} />
        </p>
      )}
      {item.suggestedBy && <p className={`${creditClass} mb-2.5`}>Suggested by {item.suggestedBy}</p>}
      {item.kw.length > 0 && (
        <div className={`${tagsClass} mb-3.5`}>
          {sortedKw(item.kw).map((kw) => (
            <KeywordPill
              key={kw}
              keyword={kw}
              active={lit.has(kw)}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw })}
            />
          ))}
        </div>
      )}
      <AwardsSection awards={item.awards} />
      <AdminItemControls item={item} />
      <div className={rowFootClass}>
        <WishlistLinks item={item} />
      </div>
    </PhoneLine>
  );
}
