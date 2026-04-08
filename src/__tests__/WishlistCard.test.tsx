import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WishlistCard from '../components/WishlistCard';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  name: 'Test Wishlist Game',
  desc: 'A great game to add.',
  yt: 'test wishlist game review',
};

describe('WishlistCard', () => {
  it('renders the item name and description', () => {
    render(<WishlistCard item={testItem} />);
    expect(screen.getByText('Test Wishlist Game')).toBeInTheDocument();
    expect(screen.getByText('A great game to add.')).toBeInTheDocument();
  });

  it('renders the Wishlist label', () => {
    render(<WishlistCard item={testItem} />);
    expect(screen.getByText('Wishlist')).toBeInTheDocument();
  });

  it('renders YouTube link that opens in new window on click', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<WishlistCard item={testItem} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', expect.stringContaining('youtube.com'));

    fireEvent.click(link);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
    );
    openSpy.mockRestore();
  });
});
