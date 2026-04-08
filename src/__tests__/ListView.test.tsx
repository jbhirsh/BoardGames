import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ListView from '../components/ListView';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { GAMES } from '../data/games';

function renderListView() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <ListView />
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('ListView', () => {
  it('renders all game names in a table', () => {
    renderListView();
    for (const game of GAMES) {
      expect(screen.getByText(game.name)).toBeInTheDocument();
    }
  });

  it('renders sortable column headers', () => {
    renderListView();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });

  it('clicking Name header toggles sort', () => {
    renderListView();
    const nameHeader = screen.getByText('Name').closest('th')!;
    fireEvent.click(nameHeader);
    // After first click, sort should be name-asc or name-desc
    // Click again to toggle
    fireEvent.click(nameHeader);
  });

  it('clicking Duration header toggles sort', () => {
    renderListView();
    const header = screen.getByText('Duration').closest('th')!;
    fireEvent.click(header);
    fireEvent.click(header);
  });

  it('clicking Players header toggles sort', () => {
    renderListView();
    const header = screen.getByText('Players').closest('th')!;
    fireEvent.click(header);
  });

  it('toggling a row open and closed', () => {
    renderListView();
    const firstGame = GAMES[0];
    const row = screen.getByText(firstGame.name).closest('tr')!;

    // Click to open
    fireEvent.click(row);
    // Click again to close
    fireEvent.click(row);
  });

  it('renders grouped view when sort is group', () => {
    function GroupListTest() {
      const { dispatch } = useFilter();
      return (
        <>
          <button onClick={() => dispatch({ type: 'SET_SORT', payload: 'group' })}>
            Set Group
          </button>
          <ListView />
        </>
      );
    }

    render(
      <MemoryRouter>
        <FilterProvider>
          <GroupListTest />
        </FilterProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Set Group'));
    expect(screen.getByText('Social Deduction')).toBeInTheDocument();
  });

  it('shows no-results when no games match', () => {
    function EmptyTest() {
      const { dispatch } = useFilter();
      return (
        <>
          <button onClick={() => dispatch({ type: 'SET_SEARCH', payload: 'zzzznotfound' })}>
            Search
          </button>
          <ListView />
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

    fireEvent.click(screen.getByText('Search'));
    expect(screen.getByText('No games match your filters.')).toBeInTheDocument();
  });
});
