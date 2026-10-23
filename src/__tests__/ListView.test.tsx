import { describe, it, expect } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Outlet, RouterProvider } from 'react-router';
import BackLink from '../components/BackLink';
import ListView from '../components/ListView';
import { sortItems } from '../utils/filterGames';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { GAMES } from '../data/games';
import { GROUPS } from '../data/keywords';

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

  it('has a difficulty column that sorts lightest first, then heaviest', () => {
    renderListView();
    const header = screen.getByRole('columnheader', { name: /Difficulty/ });
    const firstRowName = () => screen.getAllByRole('row')[1].querySelector('span.col-name')!.textContent;
    fireEvent.click(header);
    // The order is sortItems' (tested on its own), a deck placed by its
    // games; the group order plays no part in a weight sort.
    expect(firstRowName()).toBe(sortItems(GAMES, 'weight-asc', () => 0)[0].name);
    expect(header).toHaveClass('sort-asc');
    fireEvent.click(header);
    expect(firstRowName()).toBe(sortItems(GAMES, 'weight-desc', () => 0)[0].name);
    expect(header).toHaveClass('sort-desc');
    // Each game's row reads its weight.
    const catan = GAMES.find((g) => g.slug === 'catan')!;
    const row = screen.getAllByRole('row').find((r) => r.querySelector('span.col-name')?.textContent === 'Catan')!;
    expect(within(row).getByText(`Medium · ${catan.weight!.toFixed(1)}`)).toBeInTheDocument();
  });

  it('puts no Rules link on a collapsed row: Rules lives in the open panel', () => {
    renderListView();
    const rows = Array.from(document.querySelectorAll<HTMLElement>('tr.game-row'));
    expect(rows).toHaveLength(GAMES.length);
    for (const row of rows) {
      expect(within(row).queryAllByRole('link', { name: /^Rules/ })).toHaveLength(0);
      expect(row.querySelector('td.col-actions')!.children).toHaveLength(1);
    }
  });

  it('shows a dash in the difficulty cell of each game BoardGameGeek has not rated', () => {
    renderListView();
    const unrated = GAMES.filter((g) => g.weight === undefined && !g.subgames?.some((s) => s.weight !== undefined));
    expect(unrated.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not rated on BoardGameGeek')).toHaveLength(unrated.length);
    const rows = Array.from(document.querySelectorAll<HTMLElement>('tr.game-row'));
    for (const game of unrated) {
      const row = rows.find((r) => r.querySelector('span.col-name')!.textContent === game.name)!;
      const cell = row.querySelector('td.col-diff')!;
      expect(cell.querySelector('.diff-none')).toHaveTextContent(/^–$/);
      expect(cell).toHaveTextContent(/^–Not rated on BoardGameGeek$/);
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

  it('Clear filters button restores full game list', () => {
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

    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.queryByText('No games match your filters.')).not.toBeInTheDocument();
    expect(screen.getByText(GAMES[0].name)).toBeInTheDocument();
  });
});

/** A filter change the URL mirrors, made from the list's page. */
function PlayersFilter() {
  const { dispatch } = useFilter();
  return <button onClick={() => dispatch({ type: 'SET_PLAYERS', payload: 3 })}>3 players</button>;
}

/**
 * The list at `/` with the rules and score pages beside it, each with its
 * Back link, under one FilterProvider as in App, so a row's links can leave
 * the list and come back to it.
 */
function renderListRoutes(entries: string[] = ['/']) {
  const router = createMemoryRouter(
    [{
      element: <FilterProvider><Outlet /></FilterProvider>,
      children: [
        { path: '/', element: <><PlayersFilter /><ListView /></> },
        { path: '/rules/:slug/:part?', element: <BackLink /> },
        { path: '/score/:slug', element: <BackLink /> },
      ],
    }],
    { initialEntries: entries },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const toggleFor = (name: string) => screen.getByRole('button', { name: new RegExp(`^(Show|Hide) details for ${name}$`) });
const back = () => screen.getByRole('link', { name: /Back to The Game Room/ });

describe('ListView open row through a round trip', () => {
  it('starts with no row open on a fresh visit', () => {
    renderListRoutes(['/?p=4']);
    for (const toggle of screen.getAllByRole('button', { name: /^Show details for / })) {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('keeps the open row in the list\'s own history entry, not the URL', async () => {
    const router = renderListRoutes(['/?p=4']);
    await act(async () => { fireEvent.click(toggleFor('Catan')); });
    expect(toggleFor('Catan')).toHaveAttribute('aria-expanded', 'true');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?p=4');
    expect(router.state.location.state).toEqual({ openRow: 'Catan' });

    // Another row takes its place; closing it leaves none recorded.
    await act(async () => { fireEvent.click(toggleFor('Pandemic')); });
    expect(router.state.location.state).toEqual({ openRow: 'Pandemic' });
    expect(toggleFor('Catan')).toHaveAttribute('aria-expanded', 'false');
    await act(async () => { fireEvent.click(toggleFor('Pandemic')); });
    expect(toggleFor('Pandemic')).toHaveAttribute('aria-expanded', 'false');
    expect(router.state.location.state).toEqual({});
  });

  it('brings the row back open after its Rules and the page\'s Back link', async () => {
    const router = renderListRoutes();
    await act(async () => { fireEvent.click(toggleFor('Catan')); });
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Rules for Catan' })); });
    expect(router.state.location.pathname).toBe('/rules/catan');

    await act(async () => { fireEvent.click(back()); });
    expect(router.state.historyAction).toBe('POP');
    expect(toggleFor('Catan')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Rules for Catan' })).toBeInTheDocument();
  });

  it('brings the row back open after its Score and the browser\'s Back', async () => {
    const router = renderListRoutes();
    await act(async () => { fireEvent.click(toggleFor('7 Wonders')); });
    // Other games have a pad too: this row's own.
    const score = screen.getAllByRole('link', { name: /Score/ }).find((link) => link.getAttribute('href') === '/score/7-wonders')!;
    await act(async () => { fireEvent.click(score); });
    expect(router.state.location.pathname).toBe('/score/7-wonders');

    await act(async () => { await router.navigate(-1); });
    expect(toggleFor('7 Wonders')).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the row recorded when a filter rewrites the URL with it open', async () => {
    const router = renderListRoutes();
    await act(async () => { fireEvent.click(toggleFor('Catan')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '3 players' })); });
    expect(router.state.location.search).toBe('?p=3');
    expect(router.state.location.state).toEqual({ openRow: 'Catan' });

    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Rules for Catan' })); });
    await act(async () => { fireEvent.click(back()); });
    expect(toggleFor('Catan')).toHaveAttribute('aria-expanded', 'true');
  });

  it('lists each game once under its own group, and brings a row there back open', async () => {
    const router = renderListRoutes(['/?p=2&s=group']);
    const rows = Array.from(document.querySelectorAll<HTMLElement>('tbody tr.game-row, tbody tr.list-group-row'));
    const names: string[] = [];
    let heading: string | null = null;
    for (const row of rows) {
      if (row.classList.contains('list-group-row')) {
        // A heading always has a game under it.
        expect(row.nextElementSibling).toHaveClass('game-row');
        heading = row.textContent;
        continue;
      }
      const name = row.querySelector('span.col-name')!.textContent!;
      names.push(name);
      expect(heading).toBe(GROUPS[GAMES.find((g) => g.name === name)!.group]);
    }
    expect(names.length).toBe(new Set(names).size);
    expect(names.length).toBeLessThan(GAMES.length);

    await act(async () => { fireEvent.click(toggleFor('Pandemic')); });
    expect(toggleFor('Pandemic')).toHaveAttribute('aria-expanded', 'true');
    expect(toggleFor('Dominion')).toHaveAttribute('aria-expanded', 'false');
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Rules for Pandemic' })); });
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.search).toBe('?p=2&s=group');
    expect(toggleFor('Pandemic')).toHaveAttribute('aria-expanded', 'true');
    await act(async () => { fireEvent.click(toggleFor('Pandemic')); });
    expect(toggleFor('Pandemic')).toHaveAttribute('aria-expanded', 'false');
  });

  it('heads only the groups with a game showing', () => {
    renderListRoutes(['/?q=pandemic&s=group']);
    expect(document.querySelectorAll('tr.list-group-row')).toHaveLength(1);
  });

  it('heads no groups in the flat list', () => {
    renderListRoutes(['/']);
    expect(document.querySelectorAll('tr.list-group-row')).toHaveLength(0);
  });

  it('opens nothing when the list is reached anew rather than by Back', async () => {
    const router = renderListRoutes();
    await act(async () => { fireEvent.click(toggleFor('Catan')); });
    await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Rules for Catan' })); });
    // A fresh push to the home page, as from a deep link's Back.
    await act(async () => { await router.navigate('/'); });
    expect(toggleFor('Catan')).toHaveAttribute('aria-expanded', 'false');
  });
});
