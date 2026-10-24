import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import App, { HomePage } from '../App';
import { useFilter } from '../context/useFilter';
import type { FilterAction } from '../context/filterReducer';
import type { FilterState } from '../data/types';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';
import { filterGames, filterWishlist } from '../utils/filterGames';
import { gameAnchor } from '../utils/heroCovers';
import { stubGraphql } from './helpers/graphqlFetch';

// Each game's actions and each wishlist entry's links render once per
// render of the card or row they sit in, so counting them counts those.
const seen = vi.hoisted(() => ({ renders: new Map<string, number>() }));
const bump = (key: string) => seen.renders.set(key, (seen.renders.get(key) ?? 0) + 1);

vi.mock('../components/GameActions', async (importOriginal) => {
  const { default: GameActions } = await importOriginal<typeof import('../components/GameActions')>();
  return {
    default: (props: Parameters<typeof GameActions>[0]) => {
      bump(`game:${props.game.name}`);
      return <GameActions {...props} />;
    },
  };
});

vi.mock('../components/WishlistLinks', async (importOriginal) => {
  const { default: WishlistLinks } = await importOriginal<typeof import('../components/WishlistLinks')>();
  return {
    default: (props: Parameters<typeof WishlistLinks>[0]) => {
      bump(`wish:${props.item.id}`);
      return <WishlistLinks {...props} />;
    },
  };
});

vi.mock('../components/Hero', async (importOriginal) => {
  const { default: Hero } = await importOriginal<typeof import('../components/Hero')>();
  return {
    default: (props: Parameters<typeof Hero>[0]) => {
      bump('hero');
      return <Hero {...props} />;
    },
  };
});

// The store as the page last committed it, and a way to change it.
const probe = {} as { send: (action: FilterAction) => void; state: FilterState };
const send = (action: FilterAction) => probe.send(action);

function Probe() {
  const { state, dispatch } = useFilter();
  useEffect(() => {
    probe.send = dispatch;
    probe.state = state;
  });
  return null;
}

function renderHome(url: string) {
  const router = createMemoryRouter(
    [
      {
        element: <App />,
        children: [
          {
            path: '/',
            element: (
              <>
                <Probe />
                <HomePage />
              </>
            ),
          },
        ],
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
}

/** Waits until the hidden wishlist has its entries and their vote counts. */
async function settled() {
  await waitFor(() => expect(document.querySelector('.wishlist [data-item-id]')).not.toBeNull());
  await waitFor(() => expect(document.querySelector('[data-item-id] button[disabled]')).toBeNull());
}

/** How many times each counted thing rendered since `before`, leaving out the ones that didn't. */
function since(before: Map<string, number>) {
  return Object.fromEntries(
    [...seen.renders].flatMap(([key, n]) =>
      n - (before.get(key) ?? 0) > 0 ? [[key, n - (before.get(key) ?? 0)]] : [],
    ),
  );
}

const search = () =>
  within(document.querySelector('.filterbar') as HTMLElement).getByPlaceholderText('Search games...');

beforeEach(() => {
  seen.renders.clear();
  stubGraphql({
    Suggestions: () => ({ suggestions: [] }),
    Session: () => ({ session: { admin: false } }),
    WishlistVotes: () => ({ wishlistVotes: { counts: [], myVotes: [] } }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what a filter change re-renders', () => {
  it.each(['/?q=catan', '/?q=catan&v=grid'])(
    'a search keystroke that changes no card leaves the cards, the hidden wishlist and the page alone (%s)',
    async (url) => {
      renderHome(url);
      await settled();
      expect(seen.renders.get('game:Catan')).toBeGreaterThan(0);
      const before = new Map(seen.renders);

      // A trailing space: a new search, the same games, no keyword lit.
      fireEvent.change(search(), { target: { value: 'catan ' } });
      expect(probe.state.search).toBe('catan ');
      expect(since(before)).toEqual({});
    },
  );

  it('a new sort moves the cards without redrawing any of them', async () => {
    renderHome('/?v=grid');
    await settled();
    const before = new Map(seen.renders);
    act(() => send({ type: 'SET_SORT', payload: 'long' }));
    expect([...document.querySelectorAll('#collection .card-name')].map((h) => h.textContent)).toEqual(
      filterGames(GAMES, probe.state).map((g) => g.name),
    );
    expect(since(before)).toEqual({});
  });

  it('a filter that changes a card redraws it', async () => {
    renderHome('/?q=catan');
    await settled();
    const before = new Map(seen.renders);

    // Catan's add-ons seat different numbers, so the players filter changes
    // which of them fit; the counting would catch a card left stale.
    act(() => send({ type: 'SET_PLAYERS', payload: 6 }));
    expect(since(before)['game:Catan']).toBeGreaterThan(0);
  });

  it('a search that lights a keyword lights it on the cards', async () => {
    renderHome('/?v=grid');
    await settled();
    const card = document.getElementById(gameAnchor(GAMES.find((g) => g.kw.includes('strategy'))!.slug))!;
    const pill = () => within(card).getByRole('button', { name: 'Strategy' });
    expect(pill()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(search(), { target: { value: 'strat' } });
    expect(pill()).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('every filter change still reaches the visible list', () => {
  const shownGames = () =>
    within(document.getElementById('collection')!)
      .getAllByRole('button', { name: /^Show details for / })
      .map((b) => b.getAttribute('aria-label')!.replace('Show details for ', ''));
  const shownCards = () =>
    [...document.getElementById('collection')!.querySelectorAll('.card-name')].map((h) => h.textContent);
  const expectedGames = () => filterGames(GAMES, probe.state).map((g) => g.name);

  it.each<[string, FilterAction]>([
    ['players', { type: 'SET_PLAYERS', payload: 4 }],
    ['duration', { type: 'SET_DURATION', payload: 30 }],
    ['keyword', { type: 'TOGGLE_KEYWORD', payload: 'party' }],
    ['search', { type: 'SET_SEARCH', payload: 'co' }],
    ['sort', { type: 'SET_SORT', payload: 'long' }],
    ['column sort', { type: 'SET_COLUMN_SORT', payload: 'players' }],
    ['filters', { type: 'SET_FILTERS', payload: { duration: 60, players: 2 } }],
  ])('a change of %s, in the list and the grid', async (_name, action) => {
    renderHome('/?k=strategy');
    await settled();
    act(() => send(action));
    expect(shownGames()).toEqual(expectedGames());
    act(() => send({ type: 'SET_VIEW', payload: 'grid' }));
    expect(shownCards()).toEqual(expectedGames());
  });

  it('keyword mode, clearing and the toggles', async () => {
    renderHome('/?k=strategy,family&d=60');
    await settled();
    act(() => send({ type: 'SET_KEYWORD_MODE', payload: 'and' }));
    expect(shownGames()).toEqual(expectedGames());
    act(() => send({ type: 'CLEAR_FILTERS', payload: ['duration'] }));
    expect(shownGames()).toEqual(expectedGames());
    act(() => send({ type: 'CLEAR_ALL' }));
    expect(shownGames()).toHaveLength(GAMES.length);

    // The wishlist, hidden until now, shows what the filters leave of it.
    act(() => send({ type: 'SET_SEARCH', payload: 'the' }));
    act(() => send({ type: 'SET_COLLECTION', payload: 'want' }));
    const wished = [...document.getElementById('collection')!.querySelectorAll('[data-item-id]')].map((el) =>
      el.getAttribute('data-item-id'),
    );
    expect(wished).toEqual(filterWishlist(WISHLIST, probe.state).map((w) => w.id));
    expect(screen.getByText(`${wished.length} games`)).toBeInTheDocument();
  });
});
