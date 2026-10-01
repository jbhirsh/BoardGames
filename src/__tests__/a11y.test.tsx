import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';
import App, { HomePage } from '../App';
import WordCheckerPage from '../components/WordCheckerPage';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';
import SignInPage from '../components/SignInPage';
import RulesPage from '../components/RulesPage';
import { WISHLIST } from '../data/wishlist';

expect.extend(matchers);

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

describe('accessibility', () => {
  it('home page (owned games) has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ]);
    const { container } = render(<RouterProvider router={router} />);
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('home page with a card\'s games open has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ], { initialEntries: ['/?p=2&v=grid'] });
    const { container } = render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole('button', { name: /games fit$/ }));
    expect(screen.getByRole('list', { name: 'Card Deck games' })).toBeInTheDocument();
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('list row with an add-on opened to more about it has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ], { initialEntries: ['/?q=catan'] });
    const { container } = render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Catan' }));
    fireEvent.click(screen.getByRole('button', { name: 'More about Cities & Knights' }));
    expect(screen.getByRole('button', { name: 'Less about Cities & Knights' })).toHaveAttribute('aria-expanded', 'true');
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('list row with its add-ons listed from the tag has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ], { initialEntries: ['/?q=catan'] });
    render(<RouterProvider router={router} />);
    // The tag is in the description column and again in the description
    // folded under the name for narrow widths; open the column's.
    fireEvent.click(screen.getAllByRole('button', { name: 'Catan: +2 add-ons, show which' })[1]);
    expect(screen.getByRole('group', { name: 'Catan: +2 add-ons' })).toBeInTheDocument();
    // The panel is portalled onto the body, outside the render container.
    const results = await axe(document.body, bodyAxeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('rules page with rulebook tabs has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/rules/:slug/:part?', element: <RulesPage /> }] },
    ], { initialEntries: ['/rules/catan/cities-and-knights'] });
    const { container } = render(<RouterProvider router={router} />);
    expect(screen.getByRole('navigation', { name: 'Rulebooks' })).toBeInTheDocument();
    // jsdom can't host the PDF iframe's document, so axe skips into frames.
    const results = await axe(container, { ...axeOptions, iframes: false });
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('home page (wishlist) has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ], { initialEntries: ['/?c=want'] });
    const { container } = render(<RouterProvider router={router} />);
    // The wishlist body (cards, SuggestForm) mounts after the
    // suggestions fetch settles; scan once it is in the DOM.
    await screen.findByRole('form', { name: 'Suggest a game' });
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('home page (wishlist, signed in as the owner) has no axe violations', async () => {
    const json = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/auth')) return json({ admin: true });
      if (url.startsWith('/api/suggestions?action=pending')) return json({ items: [{ id: 'sug-p', game: 'Ark Nova', name: 'Sam', note: 'Zoo building' }] });
      if (url.startsWith('/api/suggestions')) return json({ items: [
        { id: 'sug-r', game: 'Root', name: 'Alex', note: '', details: { min: 2, max: 4, mins: 90, desc: 'Woodland war.', kw: ['strategy'] } },
        // Duplicates a compiled entry, so it renders in the owner tools
        // instead of on a card; scan that list too.
        { id: 'sug-d', game: WISHLIST[0].name, name: 'Alex', note: '' },
      ] });
      return json({ counts: {}, myVotes: [] });
    });
    try {
      const router = createMemoryRouter([
        { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
      ], { initialEntries: ['/?c=want'] });
      const { container } = render(<RouterProvider router={router} />);
      // Role queries over the full page are slow in jsdom; give them room.
      const slow = { timeout: TIMEOUT_MS / 3 };
      await screen.findByRole('button', { name: 'Approve Ark Nova' }, slow);
      // The per-entry edit form is the densest admin control; scan it open.
      fireEvent.click(await screen.findByRole('button', { name: 'Edit Root' }, slow));
      await screen.findByRole('form', { name: 'Edit Root' }, slow);
      const results = await axe(container, axeOptions);
      expect(results).toHaveNoViolations();
    } finally {
      fetchSpy.mockRestore();
    }
  }, TIMEOUT_MS);

  it('owner sign-in page has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/sign-in', element: <SignInPage /> }] },
    ], { initialEntries: ['/sign-in'] });
    const { container } = render(<RouterProvider router={router} />);
    await screen.findByRole('form', { name: 'Owner sign-in' });
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('award popover has no axe violations while open', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ]);
    render(<RouterProvider router={router} />);
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    fireEvent.click(screen.getAllByRole('button', { name: /awards?, show which$/ })[0]);
    await screen.findByRole('group', { name: /awards/ });
    // The panel is portalled onto the body, outside the render container.
    const results = await axe(document.body, bodyAxeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('word checker page has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <WordCheckerPage />
      </MemoryRouter>
    );
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('score calculator page has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <ScoreCalculatorPage />
      </MemoryRouter>
    );
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);
});
