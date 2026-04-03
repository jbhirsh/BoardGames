import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Hero from '../components/Hero';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';

describe('Hero', () => {
  it('renders the title', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toContain('Game');
    expect(heading.textContent).toContain('Room');
  });

  it('displays the correct game count', () => {
    render(<Hero />);
    const count = GAMES.length.toString();
    const elements = screen.getAllByText(count);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('displays the wishlist count', () => {
    render(<Hero />);
    expect(screen.getByText(WISHLIST.length.toString())).toBeInTheDocument();
  });

  it('displays stat labels', () => {
    render(<Hero />);
    expect(screen.getByText('Games')).toBeInTheDocument();
    expect(screen.getByText('Player Range')).toBeInTheDocument();
    expect(screen.getByText('Shortest')).toBeInTheDocument();
    expect(screen.getByText('Longest')).toBeInTheDocument();
    expect(screen.getByText('Wishlist')).toBeInTheDocument();
  });
});
