import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';
import App, { HomePage } from '../App';
import WordCheckerPage from '../components/WordCheckerPage';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';
import SignInPage from '../components/SignInPage';
import RulesPage from '../components/RulesPage';
import SaveOffline from '../components/SaveOffline';
import { WISHLIST, gamesAnswer, suggested } from './helpers/wishlist';
import { stubMatchMedia } from './helpers/stubMatchMedia';
import { graphqlFetch } from './helpers/graphqlFetch';
import { AuthContext } from '../context/authContextValue';
import type { AuthOutcome } from '../client/auth';

expect.extend(matchers);

// Better Auth's client (client/auth.ts), for the sign-in page's states.
const authClient = vi.hoisted(() => ({
  signInWithGoogle: vi.fn<() => Promise<AuthOutcome>>(),
  signInWithPasskey: vi.fn<() => Promise<AuthOutcome>>(),
  addPasskey: vi.fn<() => Promise<AuthOutcome>>(),
  signOut: vi.fn<() => Promise<AuthOutcome>>(),
  signedInEmail: vi.fn<() => Promise<string | null>>(),
}));
vi.mock('../client/auth', () => authClient);

// color-contrast needs real layout, which jsdom does not compute; skip it.
const axeOptions = { rules: { 'color-contrast': { enabled: false } } };
// For a scan of the whole body, which takes in a popover portalled outside
// the render container. The test renders the app without the page shell's
// landmarks, so the best-practice "region" rule would flag everything.
const bodyAxeOptions = { rules: { ...axeOptions.rules, region: { enabled: false } } };

// axe on a full page in jsdom is slow on GitHub Actions runners — default
// 5s can flake, and a timeout here cascades because vitest-axe's axe
// singleton then reports "Axe is already running" for the next test.
const TIMEOUT_MS = 30_000;
// The signed-in wishlist is the heaviest page: both lists stay mounted and
// every entry carries owner controls. Alone under coverage it takes about
// 23 s (7 s to load, 16 s for axe), so the parallel pre-push run tips it
// past 30 s while CI passes.
const OWNER_TIMEOUT_MS = 60_000;

describe('accessibility', () => {
  it(
    'home page (owned games) has no axe violations',
    async () => {
      const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }]);
      const { container } = render(<RouterProvider router={router} />);
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'time and players dropdowns have no axe violations while open',
    async () => {
      const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
        initialEntries: ['/?d=30'],
      });
      const { container } = render(<RouterProvider router={router} />);
      fireEvent.click(screen.getByRole('button', { name: 'Up to 30 min' }));
      expect(screen.getByRole('radiogroup', { name: 'Time available' })).toBeInTheDocument();
      expect(await axe(container, axeOptions)).toHaveNoViolations();
      // No count chosen, so no radio is checked.
      fireEvent.click(screen.getByRole('button', { name: 'Players' }));
      expect(screen.getByRole('radiogroup', { name: 'Players' })).toBeInTheDocument();
      expect(await axe(container, axeOptions)).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'phone filter sheet has no axe violations while open',
    async () => {
      stubMatchMedia(true);
      try {
        const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
          initialEntries: ['/?d=30&k=party'],
        });
        render(<RouterProvider router={router} />);
        fireEvent.click(screen.getByRole('button', { name: 'Filters 2' }));
        expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
        expect(await axe(document.body, bodyAxeOptions)).toHaveNoViolations();
      } finally {
        vi.unstubAllGlobals();
      }
    },
    TIMEOUT_MS,
  );

  it(
    "home page with a card's games open has no axe violations",
    async () => {
      const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
        initialEntries: ['/?p=2&v=grid'],
      });
      const { container } = render(<RouterProvider router={router} />);
      fireEvent.click(screen.getByRole('button', { name: /games fit$/ }));
      expect(screen.getByRole('list', { name: 'Card Deck games' })).toBeInTheDocument();
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'list row with an add-on opened to more about it has no axe violations',
    async () => {
      const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
        initialEntries: ['/?q=catan'],
      });
      const { container } = render(<RouterProvider router={router} />);
      fireEvent.click(screen.getByRole('button', { name: 'Show details for Catan' }));
      fireEvent.click(screen.getByRole('button', { name: 'More about Cities & Knights' }));
      expect(screen.getByRole('button', { name: 'Less about Cities & Knights' })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'list row with its add-ons listed from the tag has no axe violations',
    async () => {
      const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
        initialEntries: ['/?q=catan'],
      });
      render(<RouterProvider router={router} />);
      // The tag is in the description column and again in the description
      // folded under the name for narrow widths; open the column's.
      fireEvent.click(screen.getAllByRole('button', { name: 'Catan: +2 add-ons, show which' })[1]);
      expect(screen.getByRole('group', { name: 'Catan: +2 add-ons' })).toBeInTheDocument();
      // The panel is portalled onto the body, outside the render container.
      const results = await axe(document.body, bodyAxeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'rules page with rulebook tabs has no axe violations',
    async () => {
      const router = createMemoryRouter(
        [{ element: <App />, children: [{ path: '/rules/:slug/:part?', element: <RulesPage /> }] }],
        { initialEntries: ['/rules/catan/cities-and-knights'] },
      );
      const { container } = render(<RouterProvider router={router} />);
      expect(screen.getByRole('navigation', { name: 'Rulebooks' })).toBeInTheDocument();
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'rules page with house rules open has no axe violations',
    async () => {
      const router = createMemoryRouter(
        [{ element: <App />, children: [{ path: '/rules/:slug/:part?', element: <RulesPage /> }] }],
        { initialEntries: ['/rules/hogwarts-battle'] },
      );
      const { container } = render(<RouterProvider router={router} />);
      screen.getByText('House rules').closest('details')!.open = true;
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'Save for offline item has no axe violations in any state',
    async () => {
      for (const state of ['unsaved', 'saving', 'saved', 'failed', 'full'] as const) {
        const { container, unmount } = render(
          <main>
            <span id="rules-download-size">4.6 MB</span>
            <SaveOffline pdf="/rules/7-wonders.pdf" state={state} sized onSave={() => {}} />
          </main>,
        );
        const results = await axe(container, axeOptions);
        expect(results).toHaveNoViolations();
        unmount();
      }
    },
    TIMEOUT_MS,
  );

  it(
    'home page (wishlist) has no axe violations',
    async () => {
      const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
        initialEntries: ['/?c=want'],
      });
      const { container } = render(<RouterProvider router={router} />);
      // The wishlist body (cards, SuggestForm) mounts after the
      // suggestions fetch settles; scan once it is in the DOM.
      await screen.findByRole('form', { name: 'Suggest a game' });
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'home page (wishlist, signed in as the owner) has no axe violations',
    async () => {
      const fetchSpy = graphqlFetch({
        Session: () => ({ session: { admin: true } }),
        PendingSuggestions: () => ({
          pendingSuggestions: [
            { id: 'sug-p', game: 'Ark Nova', name: 'Sam', note: 'Zoo building' },
            { id: 'sug-m', game: 'Arkham Horry', name: 'Robin', note: '' },
          ],
        }),
        // The queue looks each one up: a preview card for one row, a miss notice for the other.
        PreviewGame: ({ game }) => ({
          previewGame:
            game === 'Ark Nova'
              ? {
                  outcome: 'FOUND',
                  details: {
                    bggId: 342942,
                    name: 'Ark Nova',
                    year: 2021,
                    min: 1,
                    max: 4,
                    mins: 150,
                    desc: 'Plan and build a modern zoo.',
                    kw: ['strategy'],
                    img: 'https://cf.geekdo-images.com/ark.jpg',
                    weight: 3.8,
                    section: 'heavy',
                    summary: null,
                    honours: [],
                  },
                }
              : { outcome: 'NO_MATCH', details: null },
        }),
        Games: () =>
          gamesAnswer([
            suggested({
              id: 'sug-r',
              name: 'Root',
              suggestedBy: 'Alex',
              minPlayers: 2,
              maxPlayers: 4,
              minutes: 90,
              players: '2–4',
              dur: '90 min',
              description: 'Woodland war.',
              keywords: ['strategy'],
            }),
          ]),
        WishlistVotes: () => ({ wishlistVotes: { counts: [], myVotes: [] } }),
      });
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetchSpy);
      try {
        const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
          initialEntries: ['/?c=want'],
        });
        const { container } = render(<RouterProvider router={router} />);
        // Role queries over the full page are slow in jsdom; give them room.
        const slow = { timeout: OWNER_TIMEOUT_MS / 3 };
        await screen.findByRole('button', { name: 'Approve Ark Nova' }, slow);
        await screen.findByText('Plan and build a modern zoo.', undefined, slow);
        await screen.findByText(/had no match for “Arkham Horry”/, undefined, slow);
        // The per-entry edit form is the densest admin control; scan it open.
        fireEvent.click(await screen.findByRole('button', { name: 'Edit Root' }, slow));
        await screen.findByRole('form', { name: 'Edit Root' }, slow);
        const results = await axe(container, axeOptions);
        expect(results).toHaveNoViolations();
      } finally {
        vi.restoreAllMocks();
      }
    },
    OWNER_TIMEOUT_MS,
  );

  /** The sign-in page at `entry`, as the owner or not. */
  function renderSignIn(admin: boolean, entry = '/sign-in') {
    const router = createMemoryRouter(
      [
        {
          element: <App />,
          children: [
            {
              path: '/sign-in',
              element: (
                <AuthContext.Provider value={{ admin, loaded: true, refresh: async () => {} }}>
                  <SignInPage />
                </AuthContext.Provider>
              ),
            },
          ],
        },
      ],
      { initialEntries: [entry] },
    );
    return render(<RouterProvider router={router} />);
  }

  it.each([
    [
      'signed out, with an error from Google',
      async () => {
        authClient.signedInEmail.mockResolvedValue(null);
        const page = renderSignIn(false, '/sign-in?error=access_denied');
        await screen.findByRole('button', { name: 'Sign in with Google' });
        await screen.findByRole('alert');
        return page;
      },
    ],
    [
      'signed in with another Google account',
      async () => {
        authClient.signedInEmail.mockResolvedValue('sam.rivera@gmail.com');
        const page = renderSignIn(false);
        await screen.findByText(/You're signed in as sam\.rivera@gmail\.com/);
        return page;
      },
    ],
    [
      'signed in as the owner',
      async () => {
        const page = renderSignIn(true);
        await screen.findByRole('button', { name: 'Add a passkey on this device' });
        return page;
      },
    ],
    [
      'signed in as the owner, with a passkey just added',
      async () => {
        authClient.addPasskey.mockResolvedValue({ ok: true });
        const page = renderSignIn(true);
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey on this device' }));
        await screen.findByText('Passkey added. Next time, sign in with Face ID.');
        return page;
      },
    ],
    [
      'signed in as the owner on a session too old to add a passkey',
      async () => {
        authClient.addPasskey.mockResolvedValue({ ok: false, code: 'SESSION_NOT_FRESH' });
        const page = renderSignIn(true);
        fireEvent.click(screen.getByRole('button', { name: 'Add a passkey on this device' }));
        await screen.findByRole('button', { name: 'Sign in with Google' });
        return page;
      },
    ],
  ])(
    'owner sign-in page (%s) has no axe violations',
    async (_state, open) => {
      const { container } = await open();
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'award popover has no axe violations while open',
    async () => {
      const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }]);
      render(<RouterProvider router={router} />);
      fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
      // The awards come with the games query's answer.
      fireEvent.click((await screen.findAllByRole('button', { name: /awards?, show which$/ }))[0]);
      await screen.findByRole('group', { name: /awards/ });
      // The panel is portalled onto the body, outside the render container.
      const results = await axe(document.body, bodyAxeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'word checker page has no axe violations',
    async () => {
      const { container } = render(
        <MemoryRouter>
          <WordCheckerPage />
        </MemoryRouter>,
      );
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it(
    'score calculator page has no axe violations, form and results',
    async () => {
      const router = createMemoryRouter([{ path: '/score/:slug', element: <ScoreCalculatorPage /> }], {
        initialEntries: ['/score/7-wonders'],
      });
      const { container } = render(<RouterProvider router={router} />);
      expect(screen.getByLabelText('Player Name')).toBeInTheDocument();
      expect(await axe(container, axeOptions)).toHaveNoViolations();

      fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Results' }));
      expect(screen.getByRole('table', { name: 'Scores by category' })).toBeInTheDocument();
      expect(await axe(container, axeOptions)).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it.each(['/score/ticket-to-ride', '/score/dominion'])(
    '%s has no axe violations, form and results',
    async (path) => {
      const router = createMemoryRouter([{ path: '/score/:slug/:part?', element: <ScoreCalculatorPage /> }], {
        initialEntries: [path],
      });
      const { container } = render(<RouterProvider router={router} />);
      if (path.endsWith('ticket-to-ride')) {
        fireEvent.click(screen.getByRole('button', { name: 'Europe' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Add ticket' }));
      } else {
        fireEvent.click(screen.getByRole('checkbox', { name: 'Gardens' }));
      }
      expect(await axe(container, axeOptions)).toHaveNoViolations();
      fireEvent.click(screen.getByRole('button', { name: 'Results' }));
      expect(await axe(container, axeOptions)).toHaveNoViolations();
    },
    TIMEOUT_MS,
  );

  it.each(['uno', 'card-deck/hearts', 'card-deck/golf', 'card-deck/spades', 'card-deck/euchre'])(
    'the %s round pad has no axe violations, with a round in',
    async (pad) => {
      const game = pad.split('/').at(-1)!;
      const rounds = {
        uno: [{ game: 'uno', out: 0, hands: [0, 12] }],
        hearts: [{ game: 'hearts', moon: null, taken: [10, 10, 6] }],
        golf: [{ game: 'golf', scores: [-2, 7] }],
        spades: [{ game: 'spades', bids: [3, 3, 3, 0], tricks: [4, 3, 3, 3] }],
        euchre: [{ game: 'euchre', makers: 1, tricks: 4, alone: false }],
      }[game];
      // Uno's first name cleared: its seat still names every box and button.
      const names =
        game === 'euchre'
          ? ['Us', 'Them']
          : game === 'spades'
            ? ['A', 'B', 'C', 'D']
            : game === 'hearts'
              ? ['A', 'B', 'C']
              : game === 'uno'
                ? ['', 'B']
                : ['A', 'B'];
      localStorage.setItem(`gameroom:score:${game}`, JSON.stringify({ names, rounds }));
      try {
        const router = createMemoryRouter([{ path: '/score/:slug/:part?', element: <ScoreCalculatorPage /> }], {
          initialEntries: [`/score/${pad}`],
        });
        const { container } = render(<RouterProvider router={router} />);
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(await axe(container, axeOptions)).toHaveNoViolations();
      } finally {
        localStorage.clear();
      }
    },
    TIMEOUT_MS,
  );
});

// Each list on its own: the whole page twice over runs past a minute under
// coverage. The stub comes off in afterEach, which runs even if a test
// times out, so a slow one can't leave the next on a phone.
describe('accessibility on a phone', () => {
  beforeEach(() => {
    stubMatchMedia(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderHome = (url: string) => {
    const router = createMemoryRouter([{ element: <App />, children: [{ path: '/', element: <HomePage /> }] }], {
      initialEntries: [url],
    });
    return render(<RouterProvider router={router} />);
  };

  it(
    'the collection, with the bar and a line open, has no axe violations',
    async () => {
      const { container } = renderHome('/');
      fireEvent.click(screen.getByRole('button', { name: 'Show details for Catan' }));
      expect(await axe(container, axeOptions)).toHaveNoViolations();
    },
    OWNER_TIMEOUT_MS,
  );

  it(
    'the wishlist, with the bar and a line open, has no axe violations',
    async () => {
      const { container } = renderHome('/?c=want');
      fireEvent.click(await screen.findByRole('button', { name: `Show details for ${WISHLIST[0].name}` }));
      expect(await axe(container, axeOptions)).toHaveNoViolations();
    },
    OWNER_TIMEOUT_MS,
  );
});
