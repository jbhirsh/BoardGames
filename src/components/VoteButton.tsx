import type { MouseEvent } from 'react';
import { tapTargetClass } from './sharedClasses';

interface Props {
  itemName: string;
  voteCount: number;
  voted: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** A phone's line, short of room: the heart and the count, the verb left to the accessible name. */
  compact?: boolean;
  /** In a list row's vote column, where it takes no tap area beyond its box. */
  inTable?: boolean;
}

const voteBaseClass =
  'vote-btn inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-bold whitespace-nowrap [transition:background_0.15s,border-color_0.15s,color_0.15s] disabled:cursor-not-allowed disabled:opacity-50';
// Where it sits: a phone's line (compact, raised over the line's tap area),
// a list row's vote column, or a card's footer.
const lineClass = `vote-btn--compact relative z-1 h-8.5 min-w-[3.6em] px-2.5 text-[14px] ${tapTargetClass}`;
const tableClass = 'min-w-[8.4em] px-3';
const cardClass = `min-w-[8.4em] px-3 max-sm:min-w-[8em] max-sm:px-2.5 ${tapTargetClass}`;

/**
 * The verb always shows, so the button reads as an action rather than a
 * badge: "♡ Vote", "♡ Vote · 2", and "♥ Voted · 3" once this viewer has
 * voted. The accessible name starts with the same word the button shows,
 * so a voice-control user can say what they see. Its minimum width keeps
 * it the same size as a vote lands. On a wishlist card it is
 * the strongest button, where a collection card's is Rules. On a phone's
 * line it is `compact`: "♡", "♡ 2", "♥ 3".
 */
export default function VoteButton({
  itemName,
  voteCount,
  voted,
  onClick,
  disabled,
  compact = false,
  inTable = false,
}: Props) {
  const plural = voteCount === 1 ? 'vote' : 'votes';
  const verb = voted ? 'Voted' : 'Vote';
  return (
    <button
      type="button"
      className={`${voteBaseClass} ${compact ? lineClass : inTable ? tableClass : cardClass} ${voted ? 'vote-btn--on border-vote bg-vote text-on-fill hover:not-disabled:border-vote-hover hover:not-disabled:bg-vote-hover' : 'border-vote bg-vote/10 text-text hover:not-disabled:bg-vote/18'}`}
      aria-label={`${verb} for ${itemName} (${voteCount} ${plural})`}
      aria-pressed={voted}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={`text-[14px] leading-none ${voted ? 'text-on-fill' : 'text-vote'}`} aria-hidden="true">
        {voted ? '♥' : '♡'}
      </span>
      {/* No count until there is one: "Vote · 0" says nobody cares. */}
      {compact ? (
        voteCount > 0 && <span className="vote-label tabular-nums">{voteCount}</span>
      ) : (
        <span className="vote-label tabular-nums">{voteCount > 0 ? `${verb} · ${voteCount}` : verb}</span>
      )}
    </button>
  );
}
