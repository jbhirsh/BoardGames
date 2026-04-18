import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WishlistRow from '../components/WishlistRow';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  id: 'test-row-game',
  name: 'Row Game',
  desc: 'A row of a game.',
  yt: 'row game review',
};

describe('WishlistRow', () => {
  it('renders name, description, vote count and YouTube link', () => {
    render(<WishlistRow item={testItem} voteCount={4} voted={false} onVote={() => {}} />);
    expect(screen.getByText('Row Game')).toBeInTheDocument();
    expect(screen.getByText('A row of a game.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vote for Row Game/ })).toHaveTextContent('4');
    expect(screen.getByRole('link')).toHaveAttribute('href', expect.stringContaining('youtube.com'));
  });

  it('fires onVote when the vote button is clicked', () => {
    const onVote = vi.fn();
    render(<WishlistRow item={testItem} voteCount={0} voted={false} onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: /Vote for/ }));
    expect(onVote).toHaveBeenCalledOnce();
  });

  it('shows voted state when the user has voted', () => {
    render(<WishlistRow item={testItem} voteCount={2} voted onVote={() => {}} />);
    expect(screen.getByRole('button', { name: /Remove your vote for Row Game/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('opens YouTube in a new window when the link is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistRow item={testItem} voteCount={0} voted={false} onVote={() => {}} />);

    fireEvent.click(screen.getByRole('link'));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('disables the vote button when disabled prop is true', () => {
    render(<WishlistRow item={testItem} voteCount={0} voted={false} onVote={() => {}} disabled />);
    expect(screen.getByRole('button', { name: /Vote for/ })).toBeDisabled();
  });
});
