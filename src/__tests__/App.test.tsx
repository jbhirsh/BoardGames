import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '../App';
import { GAMES } from '../data/games';

function renderApp() {
  return render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
}

describe('App', () => {
  it('renders without crashing', () => {
    renderApp();
    expect(screen.getByText(/Our Collection/)).toBeInTheDocument();
  });

  it('shows the correct total game count in hero', () => {
    renderApp();
    const count = GAMES.length.toString();
    const elements = screen.getAllByText(count);
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all game names in the list', () => {
    renderApp();
    for (const game of GAMES) {
      expect(screen.getByText(game.name)).toBeInTheDocument();
    }
  });

  it('renders the wishlist section', () => {
    renderApp();
    expect(screen.getByText('Lost Cities')).toBeInTheDocument();
    expect(screen.getByText('Dominion')).toBeInTheDocument();
  });
});
