import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Hero from '../components/Hero';
import { FilterProvider } from '../context/FilterContext';
import { GAMES } from '../data/games';
import { collectionSpan } from '../utils/collectionStats';

function renderHero(want = false) {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <Hero want={want} />
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

  it('speaks to a friend opening the wishlist when the toggle is on want', () => {
    renderHero(true);
    expect(screen.getByText('Help us pick our next game from the wishlist below.')).toBeInTheDocument();
    expect(screen.queryByText(/What fits tonight\?/)).not.toBeInTheDocument();
    // The title stays put; the covers turn to the wishlist's.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Our Game Room');
    expect(screen.getByRole('list', { name: 'Wishlist covers' })).toBeInTheDocument();
  });

  it('shows the collection\'s covers under the subtitle', () => {
    renderHero();
    expect(screen.getByRole('list', { name: 'Collection covers' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause cover carousel' })).toBeInTheDocument();
  });

  it('leaves picking and the list switch to the collection header', () => {
    renderHero();
    expect(screen.queryByRole('button', { name: /Pick for us/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Browse all|we want/)).not.toBeInTheDocument();
  });

  it('no longer renders the inert stat strip', () => {
    const { container } = renderHero();
    expect(container.querySelector('.hero-stats')).toBeNull();
    expect(container.querySelector('.hero-eyebrow')).toBeNull();
    expect(screen.queryByText('Player Range')).not.toBeInTheDocument();
  });
});
