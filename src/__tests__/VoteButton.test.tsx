import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VoteButton from '../components/VoteButton';

describe('VoteButton', () => {
  it('reads "♡ Vote" with no votes yet, not a zero', () => {
    render(<VoteButton itemName="Splendor" voteCount={0} voted={false} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Vote for Splendor (0 votes)' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveTextContent(/^♡Vote$/);
    expect(btn.className).not.toContain('vote-btn--on');
  });

  it('keeps the verb beside the count once there are votes: "♡ Vote · 3"', () => {
    render(<VoteButton itemName="Splendor" voteCount={3} voted={false} onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Vote for Splendor (3 votes)' });
    expect(btn).toHaveTextContent(/^♡Vote · 3$/);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('reads "♥ Voted · 5", filled and pressed, once this viewer has voted', () => {
    render(<VoteButton itemName="Splendor" voteCount={5} voted onClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Voted for Splendor (5 votes)' });
    expect(btn).toHaveTextContent(/^♥Voted · 5$/);
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn.className).toContain('vote-btn--on');
  });

  it('says "Voted" with no count while the count has not caught up', () => {
    render(<VoteButton itemName="Splendor" voteCount={0} voted onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Voted for Splendor (0 votes)' })).toHaveTextContent(/^♥Voted$/);
  });

  it('starts its accessible name with the word it shows', () => {
    const { rerender } = render(<VoteButton itemName="Splendor" voteCount={2} voted={false} onClick={() => {}} />);
    const btn = screen.getByRole('button');
    const shown = () => btn.querySelector('.vote-label')!.textContent!.split(' ')[0];
    expect(btn.getAttribute('aria-label')!.startsWith(`${shown()} `)).toBe(true);
    rerender(<VoteButton itemName="Splendor" voteCount={3} voted onClick={() => {}} />);
    expect(shown()).toBe('Voted');
    expect(btn.getAttribute('aria-label')!.startsWith(`${shown()} `)).toBe(true);
  });

  it('uses singular "vote" when count is 1', () => {
    render(<VoteButton itemName="Splendor" voteCount={1} voted={false} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Vote for Splendor (1 vote)' })).toHaveTextContent('Vote · 1');
  });

  it('uses plural "votes" when count is 0 or greater than 1', () => {
    const { rerender } = render(<VoteButton itemName="Splendor" voteCount={0} voted={false} onClick={() => {}} />);
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

  it('shows only the heart and the count when compact, keeping the full name', () => {
    const { rerender } = render(
      <VoteButton compact itemName="Splendor" voteCount={0} voted={false} onClick={() => {}} />,
    );
    const btn = screen.getByRole('button', { name: 'Vote for Splendor (0 votes)' });
    expect(btn).toHaveTextContent(/^♡$/);
    expect(btn).toHaveClass('vote-btn--compact');
    rerender(<VoteButton compact itemName="Splendor" voteCount={4} voted onClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Voted for Splendor (4 votes)' })).toHaveTextContent(/^♥4$/);
  });
});
