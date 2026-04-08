import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GridView from '../components/GridView';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { GAMES } from '../data/games';

function renderGridView() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <GridView />
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('GridView', () => {
  it('renders game cards for all games in a flat grid', () => {
    renderGridView();
    for (const game of GAMES) {
      expect(screen.getByText(game.name)).toBeInTheDocument();
    }
    expect(document.querySelector('.games-grid')).toBeInTheDocument();
  });

  it('renders grouped view when sort is group', () => {
    function GroupGridTest() {
      const { dispatch } = useFilter();
      return (
        <>
          <button onClick={() => dispatch({ type: 'SET_SORT', payload: 'group' })}>
            Set Group
          </button>
          <GridView />
        </>
      );
    }

    render(
      <MemoryRouter>
        <FilterProvider>
          <GroupGridTest />
        </FilterProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Set Group'));
    expect(screen.getByText('Social Deduction')).toBeInTheDocument();
  });

  it('shows no-results message when filteredGames is empty', () => {
    function EmptyTest() {
      const { dispatch } = useFilter();
      return (
        <>
          <button onClick={() => dispatch({ type: 'SET_SEARCH', payload: 'zzzzzznotfound' })}>
            Search Empty
          </button>
          <GridView />
        </>
      );
    }

    render(
      <MemoryRouter>
        <FilterProvider>
          <EmptyTest />
        </FilterProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Search Empty'));
    expect(screen.getByText('No games match your filters.')).toBeInTheDocument();
  });
});
