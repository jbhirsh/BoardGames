interface Props {
  itemName: string;
  voteCount: number;
  voted: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function VoteButton({ itemName, voteCount, voted, onClick, disabled }: Props) {
  const plural = voteCount === 1 ? 'vote' : 'votes';
  const label = voted
    ? `Remove your vote for ${itemName} (${voteCount} ${plural})`
    : `Vote for ${itemName} (${voteCount} ${plural})`;
  return (
    <button
      type="button"
      className={`vote-btn${voted ? ' vote-btn--on' : ''}`}
      aria-label={label}
      aria-pressed={voted}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="vote-heart" aria-hidden="true">{voted ? '\u2665' : '\u2661'}</span>
      <span className="vote-count">{voteCount}</span>
    </button>
  );
}
