import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WishlistRow from '../components/WishlistRow';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  id: 'test-row-game',
  name: 'Row Game',
  desc: 'A row of a game.',
  yt: 'row game review',
  players: '3–8',
  type: 'party',
  min: 3,
  max: 8,
  dur: '20 min',
  mins: 20,
  cat: 'medium',
  kw: ['party'],
  awards: [],
};

describe('WishlistRow', () => {
  it('renders name, description, vote count and YouTube link', () => {
    render(<WishlistRow item={testItem} voteCount={4} voted={false} onVote={() => {}} />);
    expect(screen.getByText('Row Game')).toBeInTheDocument();
    expect(screen.getByText('A row of a game.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vote for Row Game/ })).toHaveTextContent('4');
    expect(screen.getByRole('link', { name: /YouTube/ })).toHaveAttribute('href', expect.stringContaining('youtube.com'));
    expect(screen.getByRole('link', { name: 'Buy Row Game on Amazon' })).toHaveAttribute('href', expect.stringContaining('amazon.com'));
  });

  it('renders player count, type label and a non-interactive zero-award label', () => {
    render(<WishlistRow item={testItem} voteCount={0} voted={false} onVote={() => {}} />);
    expect(screen.getByText('3–8')).toBeInTheDocument();
    expect(screen.getByText('Party & Card')).toBeInTheDocument();
    const label = screen.getByText('0 awards');
    expect(label.tagName).toBe('SPAN');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('wraps player count and play time each in their own meta span', () => {
    render(<WishlistRow item={testItem} voteCount={0} voted={false} onVote={() => {}} />);
    expect(screen.getByText('3–8')).toHaveClass('wish-players');
    expect(screen.getByText('20 min')).toHaveClass('wish-players');
  });

  it('omits the play time span when the item has no known duration', () => {
    const { container } = render(<WishlistRow item={{ ...testItem, dur: '' }} voteCount={0} voted={false} onVote={() => {}} />);
    expect(screen.queryByText('20 min')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.wish-players')).toHaveLength(1);
    expect(screen.getByText('3–8')).toHaveClass('wish-players');
  });

  it('omits the players span when the item has no player count', () => {
    const { container } = render(<WishlistRow item={{ ...testItem, players: '' }} voteCount={0} voted={false} onVote={() => {}} />);
    expect(screen.queryByText('3–8')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.wish-players')).toHaveLength(1);
    expect(screen.getByText('20 min')).toHaveClass('wish-players');
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

    fireEvent.click(screen.getByRole('link', { name: /YouTube/ }));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
      'noopener',
    );
    openSpy.mockRestore();
  });

  it('opens Amazon in a new window when the buy link is clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistRow item={testItem} voteCount={0} voted={false} onVote={() => {}} />);
    fireEvent.click(screen.getByRole('link', { name: 'Buy Row Game on Amazon' }));
    expect(openSpy).toHaveBeenCalledWith('https://www.amazon.com/s?k=Row%20Game%20board%20game', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('opens the price tracker in a new window when an ASIN is pinned', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistRow item={{ ...testItem, asin: 'B0TESTASIN' }} voteCount={0} voted={false} onVote={() => {}} />);
    fireEvent.click(screen.getByRole('link', { name: /price history/ }));
    expect(openSpy).toHaveBeenCalledWith('https://camelcamelcamel.com/product/B0TESTASIN', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('disables the vote button when disabled prop is true', () => {
    render(<WishlistRow item={testItem} voteCount={0} voted={false} onVote={() => {}} disabled />);
    expect(screen.getByRole('button', { name: /Vote for/ })).toBeDisabled();
  });
});
