import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameCard from '../components/GameCard';
import { FilterProvider } from '../context/FilterContext';
import { quickGame } from './testData';

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

  it('renders the player count', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('2–4')).toBeInTheDocument();
  });

  it('renders the duration', () => {
    renderWithContext(<GameCard game={quickGame} />);
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
});
