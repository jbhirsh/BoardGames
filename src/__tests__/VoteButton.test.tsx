import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VoteButton from '../components/VoteButton';

describe('VoteButton', () => {
  it('renders unpressed state with vote label', () => {
    render(<VoteButton itemName="Splendor" voteCount={0} voted={false} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Vote for Splendor (0 votes)' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveTextContent('0');
  });

  it('renders pressed state with remove-vote label when voted', () => {
    render(<VoteButton itemName="Splendor" voteCount={5} voted onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Remove your vote for Splendor (5 votes)' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.className).toContain('vote-btn--on');
  });

  it('uses singular "vote" when count is 1', () => {
    render(<VoteButton itemName="Splendor" voteCount={1} voted={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Vote for Splendor (1 vote)' })).toBeInTheDocument();
  });

  it('uses plural "votes" when count is 0 or greater than 1', () => {
    const { rerender } = render(
      <VoteButton itemName="Splendor" voteCount={0} voted={false} onClick={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Vote for Splendor (0 votes)' })).toBeInTheDocument();
    rerender(<VoteButton itemName="Splendor" voteCount={2} voted={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Vote for Splendor (2 votes)' })).toBeInTheDocument();
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<VoteButton itemName="Splendor" voteCount={1} voted={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects disabled prop', () => {
    const onClick = vi.fn();
    render(<VoteButton itemName="Splendor" voteCount={0} voted={false} onClick={onClick} disabled />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
