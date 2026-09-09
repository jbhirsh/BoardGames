import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WishlistCard from '../components/WishlistCard';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  id: 'test-wishlist-game',
  name: 'Test Wishlist Game',
  desc: 'A great game to add.',
  yt: 'test wishlist game review',
  players: '2–4',
  type: 'strategy',
  min: 2,
  max: 4,
  dur: '30 min',
  mins: 30,
  cat: 'medium',
  kw: ['strategy'],
  awards: [{ name: 'Spiel des Jahres', year: 2020 }],
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

  it('renders player count, type label and award count', () => {
    render(<WishlistCard {...defaultProps()} />);
    expect(screen.getByText('2–4')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /: 1 award, show which$/ })).toHaveTextContent(/🏆\s*1$/);
  });

  it('uses an h4 by default and an h3 when asked, so flat lists keep heading order', () => {
    const { unmount } = render(<WishlistCard {...defaultProps()} />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Test Wishlist Game');
    unmount();
    render(<WishlistCard {...defaultProps({ headingLevel: 3 })} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Wishlist Game');
  });

  it('renders the Wishlist label', () => {
    render(<WishlistCard {...defaultProps()} />);
    expect(screen.getByText('Wishlist')).toBeInTheDocument();
  });

  it('wraps player count and play time each in their own meta span', () => {
    render(<WishlistCard {...defaultProps()} />);
    expect(screen.getByText('2–4')).toHaveClass('wish-players');
    expect(screen.getByText('30 min')).toHaveClass('wish-players');
  });

  it('omits the play time span when the item has no known duration', () => {
    const { container } = render(<WishlistCard {...defaultProps({ item: { ...testItem, dur: '' } })} />);
    expect(screen.queryByText('30 min')).not.toBeInTheDocument();
    // Only the players span remains.
    expect(container.querySelectorAll('.wish-players')).toHaveLength(1);
    expect(screen.getByText('2–4')).toHaveClass('wish-players');
  });

  it('omits the players span when the item has no player count', () => {
    const { container } = render(<WishlistCard {...defaultProps({ item: { ...testItem, players: '' } })} />);
    expect(screen.queryByText('2–4')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.wish-players')).toHaveLength(1);
    expect(screen.getByText('30 min')).toHaveClass('wish-players');
  });

  it('shows who suggested the item in place of the type label and awards', () => {
    render(<WishlistCard {...defaultProps({ item: { ...testItem, suggestedBy: 'Dana' } })} />);
    expect(screen.getByText('Suggested by Dana')).toHaveClass('wish-suggested');
    expect(screen.queryByText('Strategy')).not.toBeInTheDocument();
    expect(screen.queryByText(/award/)).not.toBeInTheDocument();
  });

  it('shows box art when the entry has some, and nothing in its place otherwise', () => {
    const { rerender } = render(<WishlistCard {...defaultProps({ item: { ...testItem, img: '/images/wishlist/x.jpg' } })} />);
    expect(screen.getByRole('img', { name: `${testItem.name} box art` })).toHaveAttribute('src', '/images/wishlist/x.jpg');
    rerender(<WishlistCard {...defaultProps()} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows no suggester line for a curated item', () => {
    render(<WishlistCard {...defaultProps()} />);
    expect(screen.queryByText(/Suggested by/)).not.toBeInTheDocument();
  });

  it('renders YouTube link that opens in new window on click', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistCard {...defaultProps()} />);

    const link = screen.getByRole('link', { name: /YouTube/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('youtube.com'));

    fireEvent.click(link);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
      'noopener',
    );
    openSpy.mockRestore();
  });

  it('renders an Amazon search link when no ASIN is pinned, and no price tracker', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistCard {...defaultProps()} />);
    const link = screen.getByRole('link', { name: 'Buy Test Wishlist Game on Amazon' });
    expect(link).toHaveAttribute('href', 'https://www.amazon.com/s?k=Test%20Wishlist%20Game%20board%20game');
    expect(screen.queryByRole('link', { name: /price history/ })).not.toBeInTheDocument();
    fireEvent.click(link);
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('amazon.com/s?k='), '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('links to the exact product and a price tracker when an ASIN is pinned', () => {
    render(<WishlistCard {...defaultProps({ item: { ...testItem, asin: 'B0TESTASIN' } })} />);
    expect(screen.getByRole('link', { name: 'Buy Test Wishlist Game on Amazon' }))
      .toHaveAttribute('href', 'https://www.amazon.com/dp/B0TESTASIN');
    expect(screen.getByRole('link', { name: /price history/ }))
      .toHaveAttribute('href', 'https://camelcamelcamel.com/product/B0TESTASIN');
  });

  it('opens the price tracker in a new window when clicked', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistCard {...defaultProps({ item: { ...testItem, asin: 'B0TESTASIN' } })} />);
    fireEvent.click(screen.getByRole('link', { name: /price history/ }));
    expect(openSpy).toHaveBeenCalledWith('https://camelcamelcamel.com/product/B0TESTASIN', '_blank', 'noopener');
    openSpy.mockRestore();
  });

  it('marks every outbound link noopener for middle-click and open-in-new-tab', () => {
    render(<WishlistCard {...defaultProps({ item: { ...testItem, asin: 'B0TESTASIN' } })} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
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
