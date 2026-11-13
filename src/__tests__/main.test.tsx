import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, use, useContext, type Context } from 'react';
import type { Root } from 'react-dom/client';
import { screen } from '@testing-library/react';
import { Outlet, useParams } from 'react-router';
import type { Auth } from '../hooks/useAuth';
import { SIGN_IN_TITLE } from '../data/signIn';
import { stubGraphql } from './helpers/graphqlFetch';

// main.tsx renders the app and wires the service worker as it loads, so each
// test sets the address, then loads a fresh copy. What it adds is the routes:
// the layout and the pages stand in by name (lazyPages.test.tsx loads the
// real pages' code), showing the route's params.
const state = vi.hoisted(() => ({
  /** While set, every page waits on it: its route's loading header shows. */
  loading: null as Promise<unknown> | null,
  /** A page that throws, for the router's error page. */
  broken: null as string | null,
  roots: [] as Root[],
  /** The owner session's context, as the fresh main.tsx's modules have it. */
  auth: null as Context<Auth> | null,
}));

vi.mock('../startSentry', () => ({}));
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock('../client/sentry', () => sentry);
// The roots main.tsx makes, to unmount after each test.
vi.mock('react-dom/client', async (importOriginal) => {
  const client = await importOriginal<typeof import('react-dom/client')>();
  return {
    ...client,
    createRoot: (...args: Parameters<typeof client.createRoot>) => {
      const root = client.createRoot(...args);
      state.roots.push(root);
      return root;
    },
  };
});

const stand = vi.hoisted(() => (name: string) => {
  function Page() {
    const { slug, part } = useParams();
    const { admin } = useContext(state.auth!);
    if (state.loading) use(state.loading);
    if (state.broken === name) throw new Error(`${name} broke`);
    return <h1>{[name, slug, part, admin && 'admin'].filter(Boolean).join(' ')}</h1>;
  }
  return Page;
});
vi.mock('../App', () => ({
  default: () => (
    <div data-testid="layout">
      <Outlet />
    </div>
  ),
  HomePage: stand('HomePage'),
}));
vi.mock('../lazyPages', () => ({
  RulesPage: stand('RulesPage'),
  ScoreCalculatorPage: stand('ScoreCalculatorPage'),
  WordCheckerPage: stand('WordCheckerPage'),
  SignInPage: stand('SignInPage'),
  EmailedDecisionPage: stand('EmailedDecisionPage'),
}));

/** Loads main.tsx afresh at `path`, rendering into a new #root. */
async function open(path: string) {
  window.history.replaceState(null, '', path);
  document.body.innerHTML = '<div id="root"></div>';
  vi.resetModules();
  state.auth = (await import('../context/authContextValue')).AuthContext;
  await act(async () => {
    await import('../main');
  });
}

beforeEach(() => {
  state.loading = null;
  state.broken = null;
  // Only /sign-in asks after the owner's session.
  stubGraphql({ Session: () => ({ session: { admin: true } }) });
});

afterEach(() => {
  for (const root of state.roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sentry.captureException.mockClear();
});

const heading = () => screen.findByRole('heading', { level: 1 });

describe('the routes', () => {
  it.each([
    ['/', 'HomePage'],
    ['/rules/catan', 'RulesPage catan'],
    ['/rules/catan/5-6-player-extension', 'RulesPage catan 5-6-player-extension'],
    ['/score/7-wonders', 'ScoreCalculatorPage 7-wonders'],
    ['/score/card-deck/hearts', 'ScoreCalculatorPage card-deck hearts'],
    ['/word-checker', 'WordCheckerPage'],
    ['/approve', 'EmailedDecisionPage'],
    ['/deny', 'EmailedDecisionPage'],
  ])('%s shows %s, inside the layout', async (path, page) => {
    await open(path);
    expect(await heading()).toHaveTextContent(page);
    expect(screen.getByTestId('layout')).toContainElement(screen.getByRole('heading'));
  });

  it("checks the owner's session for the sign-in page", async () => {
    await open('/sign-in');
    expect(await screen.findByRole('heading', { name: 'SignInPage admin' })).toBeInTheDocument();
  });

  it('checks no session for the pages that need none', async () => {
    await open('/word-checker');
    expect(await heading()).toHaveTextContent('WordCheckerPage');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the not-found page at an address that leads nowhere', async () => {
    await open('/no/such/page');
    expect(await heading()).toHaveTextContent('This box is empty');
    expect(screen.getByRole('link', { name: 'Browse the collection' })).toHaveAttribute('href', '/');
  });

  it('shows the error page, reporting the error, when a page throws', async () => {
    state.broken = 'ScoreCalculatorPage';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await open('/score/7-wonders');
    expect(await heading()).toHaveTextContent('Something went wrong');
    expect(sentry.captureException).toHaveBeenCalledWith(new Error('ScoreCalculatorPage broke'));
  });
});

describe("a page's loading header", () => {
  beforeEach(() => {
    state.loading = new Promise<never>(() => {});
  });

  // The header's words are laid out unseen (RouteFallback.tsx): no heading yet.
  const header = async () => {
    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('heading')).toBeNull();
    return screen.getByRole('banner');
  };

  it.each([
    ['/rules/catan', 'Catan'],
    ['/score/7-wonders', 'Score Calculator'],
    ['/word-checker', 'Word Checker'],
    ['/sign-in', SIGN_IN_TITLE],
    ['/approve', 'Approve'],
    ['/deny', 'Deny'],
  ])('%s shows the header of %s while its code loads', async (path, title) => {
    await open(path);
    expect(await header()).toHaveTextContent(title);
  });

  it("lays out the sign-in page's introduction too", async () => {
    await open('/sign-in');
    expect(await header()).toHaveTextContent(/Signed in, the wishlist shows/);
  });
});

describe("a page's frame", () => {
  const back = () => screen.queryByRole('link', { name: /Back to The Game Room/ });

  it.each(['/rules/catan', '/score/7-wonders', '/word-checker', '/sign-in', '/approve'])(
    '%s keeps one Back link from its loading header to the page',
    async (path) => {
      let arrive!: () => void;
      state.loading = new Promise<void>((resolve) => (arrive = resolve));
      await open(path);
      expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
      const before = back();
      expect(before).toHaveAttribute('href', '/');
      await act(async () => arrive());
      expect(await heading()).toBeInTheDocument();
      // The same element: a press begun on the loading page's Back and ended
      // on the page's would otherwise reach neither link.
      expect(back()).toBe(before);
    },
  );

  it.each([
    ['/rules/no-such-game', 'RulesPage no-such-game'],
    ['/score/no-such-game', 'ScoreCalculatorPage no-such-game'],
    ['/score/7-wonders/no-such-part', 'ScoreCalculatorPage 7-wonders no-such-part'],
  ])('%s, which opens no page, gets no frame: its page draws the not-found page', async (path, page) => {
    await open(path);
    expect(await heading()).toHaveTextContent(page);
    expect(back()).toBeNull();
  });
});

describe('the service worker', () => {
  /** Stands in navigator.serviceWorker, and the page's load listener main.tsx adds. */
  function serviceWorker(register: () => Promise<unknown>) {
    const container = { register: vi.fn(register) };
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
    const listen = vi.spyOn(window, 'addEventListener');
    const loaded = () => {
      for (const [type, listener] of listen.mock.calls) {
        if (type === 'load' && typeof listener === 'function') listener(new Event('load'));
      }
    };
    return { register: container.register, loaded };
  }

  afterEach(() => {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  it('is registered once the page has loaded, in production', async () => {
    vi.stubEnv('PROD', true);
    const { register, loaded } = serviceWorker(() => Promise.resolve({}));
    await open('/');
    expect(register).not.toHaveBeenCalled();
    loaded();
    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js');
  });

  it("leaves the page as it is when it can't be registered", async () => {
    vi.stubEnv('PROD', true);
    const { register, loaded } = serviceWorker(() => Promise.reject(new Error('blocked')));
    await open('/');
    loaded();
    expect(register).toHaveBeenCalledOnce();
    // A refusal main.tsx left unhandled would fail the run here.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await heading()).toHaveTextContent('HomePage');
  });

  it('is never registered in development, where it would serve old code over the dev server', async () => {
    vi.stubEnv('PROD', false);
    const { register, loaded } = serviceWorker(() => Promise.resolve({}));
    await open('/');
    loaded();
    expect(register).not.toHaveBeenCalled();
  });
});
