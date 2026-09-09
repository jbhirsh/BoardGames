import type { KeywordId, WishlistItem } from '../data/types';
import { isKeywordLit } from '../utils/keywordLit';
import { useFilter } from '../context/useFilter';
import { sortedKw } from '../utils/filterGames';
import DurationPill from './DurationPill';
import KeywordPill from './KeywordPill';
import { AwardsCount, AwardsList } from './AwardsBadge';
import WishlistLinks from './WishlistLinks';
import VoteButton from './VoteButton';
import AdminItemControls from './AdminItemControls';
import { ChevronIcon } from './Icons';
import { TABLE_COLUMNS } from './GamesTableHead';
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
  const { state, dispatch } = useFilter();
  const lit = (kw: KeywordId) => isKeywordLit(state, kw);

  const summary = shortDesc(item.desc);
  return (
    <>
      <tr className={`game-row${isOpen ? ' open' : ''}`} onClick={onToggle} data-testid="wishlist-item" data-item-id={item.id}>
        <td className="col-name">
          <div className="col-name-wrap">
            <span className="col-name">{item.name}</span>
            <span className="mobile-short">{summary}</span>
            <AwardsCount awards={item.awards} />
          </div>
        </td>
        <td className="col-hide col-players-h col-players">{item.players}</td>
        <td>
          {item.dur && (
            <DurationPill
              cat={item.cat}
              className="row-dur"
              onClick={() => dispatch({ type: 'SET_DURATION', payload: item.cat })}
            />
          )}
        </td>
        <td className="col-hide col-short">{summary}</td>
        <td className="col-hide col-tags col-kw">
          {sortedKw(item.kw).map((kw) => (
            <KeywordPill
              key={kw}
              keyword={kw as KeywordId}
              active={lit(kw as KeywordId)}
              onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: kw as KeywordId })}
            />
          ))}
        </td>
        <td className="col-vote">
          <VoteButton
            itemName={item.name}
            voteCount={voteCount}
            voted={voted}
            onClick={(e) => { e.stopPropagation(); onVote(); }}
            disabled={disabled}
          />
        </td>
        <td className="col-actions">
          <button
            type="button"
            className="row-toggle"
            aria-expanded={isOpen}
            aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${item.name}`}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
          >
            <ChevronIcon />
          </button>
        </td>
      </tr>
      <tr className="row-expand">
        <td colSpan={WISHLIST_COLUMNS} style={{ padding: 0 }}>
          {/* Collapsed only visually, so it is inert until opened: nothing in it
              should take focus or be read out. */}
            <div className="row-expand-inner" inert={!isOpen}>
            <div className="row-expand-content">
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
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
