import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Hero from '../components/Hero';
import { FilterProvider } from '../context/FilterContext';
import { GAMES } from '../data/games';
import { collectionSpan } from '../utils/collectionStats';

function renderHero() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <Hero />
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('Hero', () => {
  it('renders the title', () => {
    renderHero();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toContain('Game');
    expect(heading.textContent).toContain('Room');
  });

  it('states the collection size and span from the data, not literals', () => {
    renderHero();
    const { shortest, longest } = collectionSpan(GAMES);
    expect(
      screen.getByText(`${GAMES.length} games, ${shortest} to ${longest}. What fits tonight?`)
    ).toBeInTheDocument();
  });

  it('offers the random picker above the fold', () => {
    renderHero();
    expect(screen.getByRole('button', { name: /Pick for us/i })).toBeInTheDocument();
  });

  it('links to the collection', () => {
    renderHero();
    const browse = screen.getByRole('link', { name: new RegExp(`Browse all ${GAMES.length}`) });
    expect(browse).toHaveAttribute('href', '#collection');
  });

  it('no longer renders the inert stat strip', () => {
    const { container } = renderHero();
    expect(container.querySelector('.hero-stats')).toBeNull();
    expect(container.querySelector('.hero-eyebrow')).toBeNull();
    expect(screen.queryByText('Player Range')).not.toBeInTheDocument();
  });
});
