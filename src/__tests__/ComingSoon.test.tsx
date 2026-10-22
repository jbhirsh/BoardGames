import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ComingSoon from '../components/ComingSoon';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { ALL_GAMES, COMING_SOON, GAMES } from '../data/games';

function renderComingSoon() {
  function WithControls() {
    const { dispatch } = useFilter();
    return (
      <>
        <button onClick={() => dispatch({ type: 'SET_SEARCH', payload: 'unstoppable' })}>Search</button>
        <button onClick={() => dispatch({ type: 'SET_SEARCH', payload: 'catan' })}>Miss</button>
        <ComingSoon />
      </>
    );
  }
  return render(
    <MemoryRouter>
      <FilterProvider>
        <WithControls />
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('the games on their way', () => {
  it('keeps them out of the collection and in their own list', () => {
    expect(COMING_SOON.length).toBeGreaterThan(0);
    expect(COMING_SOON.every((g) => g.arriving)).toBe(true);
    expect(GAMES.some((g) => g.arriving)).toBe(false);
    expect(ALL_GAMES).toHaveLength(GAMES.length + COMING_SOON.length);
  });
});

describe('ComingSoon', () => {
  it('lists each game on its way as a card, tagged with when it is due', () => {
    renderComingSoon();
    expect(screen.getByRole('heading', { level: 2, name: 'Coming Soon' })).toBeInTheDocument();
    for (const game of COMING_SOON) {
      const card = screen.getByRole('heading', { level: 3, name: game.name }).closest('.game-card') as HTMLElement;
      expect(within(card).getByText(`Arriving ${game.arriving}`)).toBeInTheDocument();
    }
  });

  it('follows the search, and goes away when nothing on its way fits', () => {
    renderComingSoon();
    fireEvent.click(screen.getByText('Search'));
    expect(screen.getByRole('heading', { name: 'Dungeon Crawler Carl: Unstoppable' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Arkham Horror: Remastered' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Miss'));
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
  });

  it('hides with the collection while the wishlist is showing', () => {
    const { container } = render(
      <MemoryRouter>
        <FilterProvider>
          <ComingSoon hidden />
        </FilterProvider>
      </MemoryRouter>,
    );
    expect(container.querySelector('section.coming-soon')).toHaveAttribute('hidden');
    expect(screen.queryByRole('heading', { name: 'Coming Soon' })).not.toBeInTheDocument();
  });
});
