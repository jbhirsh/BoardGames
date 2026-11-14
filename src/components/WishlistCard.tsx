import { memo, useId, useState } from 'react';
import type { WishlistItem } from '../data/types';
import { shortDesc } from '../utils/shortDesc';
import { useFilterDispatch, useItemFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import { UserIcon, ClockIcon } from './Icons';
import KeywordPill from './KeywordPill';
import WishlistLinks from './WishlistLinks';
import AwardsBadge from './AwardsBadge';
import VoteButton from './VoteButton';
import AdminItemControls from './AdminItemControls';
import ExpansionTag from './ExpansionTag';
import DifficultyMeta from './DifficultyMeta';
import { wishAnchor } from '../utils/heroCovers';
import { useNarrow } from '../hooks/useNarrow';
import {
  cardBodyClass,
  cardClass,
  cardDescClass,
  cardFootClass,
  cardFootEndClass,
  cardHeadClass,
  cardMetaClass,
  cardMoreClass,
  cardNameClass,
  cornerArtClass,
  cornerClass,
  creditClass,
  metaClass,
  stickerClass,
  stickerHeadClass,
  tagsClass,
} from './sharedClasses';

interface Props {
  item: WishlistItem;
  voteCount: number;
  voted: boolean;
  /** Called with the entry's id, so one callback serves every card. */
  onVote: (id: string) => void;
  disabled?: boolean;
  /** h4 under a group heading, h3 in a flat list, so heading levels never skip. */
  headingLevel?: 3 | 4;
}

/**
 * A wishlist entry in the grid: the collection's card, with a vote and buy
 * links where Rules would be. Its award pill sits on its box art, or leads
 * its tags when it has none (#324). The footer is one row: the owner's
 * pencil and bin, then Vote and the links, Vote showing just its heart and
 * count on a footer too narrow for all five. Memoized: a filter change that
 * leaves this entry as it was doesn't redraw it.
 */
export default memo(WishlistCard);

function WishlistCard({ item, voteCount, voted, onVote, disabled, headingLevel = 4 }: Props) {
  const { lit } = useItemFilter();
  const dispatch = useFilterDispatch();
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  // The card opens on its one line, BoardGameGeek's summary or else the
  // description's first sentence, as the list row does, and More shows the
  // description.
  const [moreOpen, setMoreOpen] = useState(false);
  const descId = useId();
  const short = item.short ?? shortDesc(item.desc);
  const hasMore = short !== item.desc.trim();
  // The head's text keeps clear of the box art in its corner, where there is art.
  const clear = item.img ? 'pr-(--corner-clear)' : '';
  const awarded = (item.awards?.length ?? 0) > 0;
  // A footer narrower than the owner's pencil, bin, a full Vote and the two
  // links need (290–330px cards): Vote turns compact, as on a phone's line.
  const [voteNarrow, footRef] = useNarrow(262);

  return (
    <div
      id={wishAnchor(item.id)}
      className={`game-card wish-card ${cardClass}`}
      data-testid="wishlist-item"
      data-item-id={item.id}
    >
      <div className={`${cardHeadClass} ${item.img ? '' : 'no-art'} ${item.img && awarded ? stickerHeadClass : ''}`}>
        <Heading className={`${cardNameClass} ${clear}`} tabIndex={-1} data-focus-target="item">
          {item.name}
        </Heading>
        <div className={`${cardMetaClass} ${clear}`}>
          {item.players && (
            <span className={metaClass}>
              <UserIcon /> {item.players}
            </span>
          )}
          {item.dur && (
            <span className={metaClass}>
              <ClockIcon /> {item.dur}
            </span>
          )}
          <DifficultyMeta item={item} />
        </div>
        {item.expands && (
          <p className={`pt-2 ${clear}`}>
            <ExpansionTag base={item.expands} />
          </p>
        )}
        {/* With no art to sit on, the award pill leads the tags, even when there are none. */}
        {(item.kw.length > 0 || (!item.img && awarded)) && (
          <div className={`${tagsClass} pt-2 ${clear}`}>
            {!item.img && <AwardsBadge itemName={item.name} awards={item.awards} />}
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
        {item.img && (
          <div className={cornerClass}>
            <img src={item.img} alt={`${item.name} box art`} className={cornerArtClass} loading="lazy" />
            <div className={stickerClass}>
              <AwardsBadge itemName={item.name} awards={item.awards} sticker />
            </div>
          </div>
        )}
      </div>
      <div className={cardBodyClass}>
        <p className={cardDescClass} id={descId}>
          {moreOpen || !hasMore ? item.desc : short}
          {hasMore && (
            <>
              {' '}
              <button
                type="button"
                className={cardMoreClass}
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
        {item.suggestedBy && <p className={`${creditClass} mt-2`}>Suggested by {item.suggestedBy}</p>}
      </div>
      <div className={cardFootClass} ref={footRef}>
        <AdminItemControls item={item} />
        <div className={cardFootEndClass}>
          <VoteButton
            itemName={item.name}
            voteCount={voteCount}
            voted={voted}
            onClick={() => onVote(item.id)}
            disabled={disabled}
            compact={voteNarrow}
          />
          <WishlistLinks item={item} />
        </div>
      </div>
    </div>
  );
}
