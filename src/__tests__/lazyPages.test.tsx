import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Suspense, type ComponentType, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { RELOAD_KEY } from '../utils/chunkReload';

// Each page's module, stood in for by its name: what lazyPages.ts adds is the
// loading, not the page.
vi.mock('../components/RulesPage', () => ({ default: () => <h1>RulesPage</h1> }));
vi.mock('../components/ScoreCalculatorPage', () => ({ default: () => <h1>ScoreCalculatorPage</h1> }));
vi.mock('../components/WordCheckerPage', () => ({ default: () => <h1>WordCheckerPage</h1> }));
vi.mock('../components/SignInPage', () => ({ default: () => <h1>SignInPage</h1> }));
const emailedDecisionPage = vi.hoisted(() => () => ({ default: () => <h1>EmailedDecisionPage</h1> }));
vi.mock('../components/EmailedDecisionPage', emailedDecisionPage);

/** A fresh lazyPages.ts, so each test's pages load anew. */
async function pages() {
  vi.resetModules();
  return import('../lazyPages');
}

/** The router's error page, in short: says the page failed, and keeps what it threw. */
class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? <p>Failed</p> : this.props.children;
  }
}

function show(Page: ComponentType) {
  return render(
    <Suspense fallback={<p>Loading</p>}>
      <Page />
    </Suspense>,
  );
}

beforeEach(() => {
  // A reload already tried this session, for a page that wouldn't load.
  window.sessionStorage.setItem(RELOAD_KEY, '1');
});

afterEach(() => {
  vi.doMock('../components/EmailedDecisionPage', emailedDecisionPage);
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('lazyPages', () => {
  it.each(['RulesPage', 'ScoreCalculatorPage', 'WordCheckerPage', 'SignInPage', 'EmailedDecisionPage'] as const)(
    "loads %s's code when first shown, then clears the reload flag",
    async (name) => {
      const Page = (await pages())[name];
      show(Page);
      expect(screen.getByText('Loading')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { name })).toBeInTheDocument();
      expect(window.sessionStorage.getItem(RELOAD_KEY)).toBeNull();
    },
  );

  it('keeps the flag when the code fails to load, so the error page reloads no more', async () => {
    vi.doMock('../components/EmailedDecisionPage', () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const { EmailedDecisionPage } = await pages();
    // React logs the error the boundary catches.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Boundary>
        <Suspense fallback={<p>Loading</p>}>
          <EmailedDecisionPage />
        </Suspense>
      </Boundary>,
    );
    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(RELOAD_KEY)).toBe('1');
  });
});
