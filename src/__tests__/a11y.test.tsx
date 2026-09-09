import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';
import App, { HomePage } from '../App';
import WordCheckerPage from '../components/WordCheckerPage';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';

expect.extend(matchers);

// color-contrast needs real layout, which jsdom does not compute; skip it.
const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

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

  it('home page (wishlist) has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ], { initialEntries: ['/?c=want'] });
    const { container } = render(<RouterProvider router={router} />);
    // The wishlist body (cards, OwnButton, SuggestForm) mounts after the
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
      if (url.startsWith('/api/suggestions')) return json({ items: [{ id: 'sug-r', game: 'Root', name: 'Alex', note: '', details: { min: 2, max: 4, mins: 90, desc: 'Woodland war.', kw: ['strategy'] } }] });
      if (url.startsWith('/api/owners')) return json({ owners: {}, mine: [] });
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
