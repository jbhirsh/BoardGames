import type { MouseEvent } from 'react';

interface Props {
  itemName: string;
  voteCount: number;
  voted: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  /** A phone's line, short of room: the heart and the count, the verb left to the accessible name. */
  compact?: boolean;
}

/**
 * The verb always shows, so the button reads as an action rather than a
 * badge: "♡ Vote", "♡ Vote · 2", and "♥ Voted · 3" once this viewer has
 * voted. The accessible name starts with the same word the button shows,
 * so a voice-control user can say what they see. Its minimum width
 * (App.css) keeps it the same size as a vote lands. On a wishlist card it is
 * the strongest button, where a collection card's is Rules. On a phone's
 * line it is `compact`: "♡", "♡ 2", "♥ 3".
 */
export default function VoteButton({ itemName, voteCount, voted, onClick, disabled, compact = false }: Props) {
  const plural = voteCount === 1 ? 'vote' : 'votes';
  const verb = voted ? 'Voted' : 'Vote';
  return (
    <button
      type="button"
      className={`vote-btn${voted ? ' vote-btn--on' : ''}${compact ? ' vote-btn--compact' : ''}`}
      aria-label={`${verb} for ${itemName} (${voteCount} ${plural})`}
      aria-pressed={voted}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="vote-heart" aria-hidden="true">
        {voted ? '♥' : '♡'}
      </span>
      {/* No count until there is one: "Vote · 0" says nobody cares. */}
      {compact ? (
        voteCount > 0 && <span className="vote-label">{voteCount}</span>
      ) : (
        <span className="vote-label">{voteCount > 0 ? `${verb} · ${voteCount}` : verb}</span>
      )}
    </button>
  );
}
