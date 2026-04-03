import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Wishlist from '../components/Wishlist';
import { WISHLIST } from '../data/wishlist';

describe('Wishlist', () => {
  it('renders all wishlist items', () => {
    render(<Wishlist />);
    for (const item of WISHLIST) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
    }
  });

  it('renders wishlist item descriptions', () => {
    render(<Wishlist />);
    for (const item of WISHLIST) {
      expect(screen.getByText(item.desc)).toBeInTheDocument();
    }
  });
});
