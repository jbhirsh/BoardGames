import type { MouseEvent } from 'react';

interface Props {
  itemName: string;
  voteCount: number;
  voted: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

/**
 * The verb always shows, so the button reads as an action rather than a
 * badge: "♡ Vote", "♡ Vote · 2", and "♥ Voted · 3" once this viewer has
 * voted. The accessible name starts with the same word the button shows,
 * so a voice-control user can say what they see. Its minimum width
 * (App.css) keeps it the same size as a vote lands. On a wishlist card it is
 * the strongest button, where a collection card's is Rules.
 */
export default function VoteButton({ itemName, voteCount, voted, onClick, disabled }: Props) {
  const plural = voteCount === 1 ? 'vote' : 'votes';
  const verb = voted ? 'Voted' : 'Vote';
  return (
    <button
      type="button"
      className={`vote-btn${voted ? ' vote-btn--on' : ''}`}
      aria-label={`${verb} for ${itemName} (${voteCount} ${plural})`}
      aria-pressed={voted}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="vote-heart" aria-hidden="true">{voted ? '♥' : '♡'}</span>
      {/* No count until there is one: "Vote · 0" says nobody cares. */}
      <span className="vote-label">{voteCount > 0 ? `${verb} · ${voteCount}` : verb}</span>
    </button>
  );
}
