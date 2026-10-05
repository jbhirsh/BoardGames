import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Hero from '../components/Hero';
import { GAMES } from '../data/games';
import { collectionSpan } from '../utils/collectionStats';

function renderHero() {
  return render(
    <MemoryRouter>
      <Hero />
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

  it('shows a shelf of box covers, each opening its rulebook', () => {
    renderHero();
    const links = within(screen.getByRole('list', { name: 'Rulebooks' })).getAllByRole('link');
    expect(links).toHaveLength(7);
    for (const link of links) {
      const name = link.getAttribute('aria-label')!.replace(/ rules$/, '');
      const game = GAMES.find((g) => g.name === name)!;
      expect(link).toHaveAttribute('href', `/rules/${game.slug}`);
      expect(link.querySelector('img')).toHaveAttribute('src', game.img);
    }
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
