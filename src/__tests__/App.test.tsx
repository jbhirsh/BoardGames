import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { GAMES } from '../data/games';

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText(/Our Collection/)).toBeInTheDocument();
  });

  it('shows the correct total game count in hero', () => {
    render(<App />);
    const count = GAMES.length.toString();
    const elements = screen.getAllByText(count);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all game names in the list', () => {
    render(<App />);
    for (const game of GAMES) {
      expect(screen.getByText(game.name)).toBeInTheDocument();
    }
  });

  it('renders the wishlist section', () => {
    render(<App />);
    expect(screen.getByText('Lost Cities')).toBeInTheDocument();
    expect(screen.getByText('Dominion')).toBeInTheDocument();
  });
});
