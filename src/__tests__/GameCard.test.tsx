import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameCard from '../components/GameCard';
import { FilterProvider } from '../context/FilterContext';
import { quickGame, mediumGame } from './testData';
import type { Game } from '../data/types';

function renderWithContext(ui: React.ReactElement) {
  return render(
    <MemoryRouter>
      <FilterProvider>{ui}</FilterProvider>
    </MemoryRouter>
  );
}

describe('GameCard', () => {
  it('renders the game name', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('Quick Game')).toBeInTheDocument();
  });

  it('renders the player count and duration', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('2–4')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
  });

  it('renders keyword pills', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('Card Game')).toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
  });

  it('renders the short description', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('A quick card game.')).toBeInTheDocument();
  });

  it('renders Rules link pointing to /rules/slug when game has rules', () => {
    renderWithContext(<GameCard game={quickGame} />);
    const rulesLink = screen.getByTitle('Rules');
    expect(rulesLink).toBeInTheDocument();
    expect(rulesLink.closest('a')).toHaveAttribute('href', '/rules/quick-game');
  });

  it('renders fallback rules link when game has no rules field', () => {
    const noRulesGame: Game = { ...quickGame, rules: '' };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderWithContext(<GameCard game={noRulesGame} />);
    const rulesLink = screen.getByTitle('Rules');
    fireEvent.click(rulesLink);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('google.com/search'),
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('renders YouTube link that opens in new window', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderWithContext(<GameCard game={quickGame} />);
    const ytLink = screen.getByTitle('Watch Tutorial');
    fireEvent.click(ytLink);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('clicking a keyword pill dispatches TOGGLE_KEYWORD', () => {
    renderWithContext(<GameCard game={mediumGame} />);
    const pill = screen.getByText('Strategy');
    fireEvent.click(pill);
    // After clicking, the pill should be active (lit class)
    expect(pill).toHaveClass('lit');
  });
});
