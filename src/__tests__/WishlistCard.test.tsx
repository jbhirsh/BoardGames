import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WishlistCard from '../components/WishlistCard';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  id: 'test-wishlist-game',
  name: 'Test Wishlist Game',
  desc: 'A great game to add.',
  yt: 'test wishlist game review',
};

function defaultProps(overrides: Partial<React.ComponentProps<typeof WishlistCard>> = {}) {
  return {
    item: testItem,
    voteCount: 0,
    voted: false,
    onVote: () => {},
    ...overrides,
  };
}

describe('WishlistCard', () => {
  it('renders the item name and description', () => {
    render(<WishlistCard {...defaultProps()} />);
    expect(screen.getByText('Test Wishlist Game')).toBeInTheDocument();
    expect(screen.getByText('A great game to add.')).toBeInTheDocument();
  });

  it('renders the Wishlist label', () => {
    render(<WishlistCard {...defaultProps()} />);
    expect(screen.getByText('Wishlist')).toBeInTheDocument();
  });

  it('renders YouTube link that opens in new window on click', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistCard {...defaultProps()} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringContaining('youtube.com'));

    fireEvent.click(link);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('renders a vote button with the provided count', () => {
    render(<WishlistCard {...defaultProps({ voteCount: 7 })} />);
    const btn = screen.getByRole('button', { name: /Vote for Test Wishlist Game/i });
    expect(btn).toHaveTextContent('7');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows pressed state and updated label when already voted', () => {
    render(<WishlistCard {...defaultProps({ voted: true, voteCount: 3 })} />);
    const btn = screen.getByRole('button', { name: /Remove your vote for Test Wishlist Game/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('invokes onVote when the vote button is clicked', () => {
    const onVote = vi.fn();
    render(<WishlistCard {...defaultProps({ onVote })} />);
    fireEvent.click(screen.getByRole('button', { name: /Vote for/i }));
    expect(onVote).toHaveBeenCalledOnce();
  });

  it('disables the vote button when disabled prop is true', () => {
    render(<WishlistCard {...defaultProps({ disabled: true })} />);
    expect(screen.getByRole('button', { name: /Vote for/i })).toBeDisabled();
  });
});
