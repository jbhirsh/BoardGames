import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import App, { HomePage } from '../App';
import { GAMES } from '../data/games';

function renderApp(url = '/') {
  const router = createMemoryRouter([
    {
      element: <App />,
      children: [{ path: '/', element: <HomePage /> }],
    },
  ], { initialEntries: [url] });
  return render(<RouterProvider router={router} />);
}

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    renderApp();
    expect(screen.getByText(/Our Collection/)).toBeInTheDocument();
  });

  it('shows the correct total game count in hero', () => {
    renderApp();
    const count = GAMES.length.toString();
    // The count now reads inside the hero sentence and the "Browse all" link
    // rather than as a standalone figure in the deleted stat strip.
    const elements = screen.getAllByText(new RegExp(`\\b${count}\\b`));
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders all game names in the list', () => {
    renderApp();
    for (const game of GAMES) {
      expect(screen.getByText(game.name)).toBeInTheDocument();
    }
  });

  it('shows only the owned games by default, and the wishlist in want mode', async () => {
    renderApp();
    expect(screen.getByText('Codenames')).toBeVisible();
    // The wishlist stays mounted but hidden, so its rows exist without showing.
    expect(await screen.findByText('Lost Cities')).not.toBeVisible();
    expect(document.querySelectorAll('#collection')).toHaveLength(1);
    expect(document.getElementById('collection')).toHaveTextContent('Our Collection');
    cleanup();

    renderApp('/?c=want');
    expect(await screen.findByText('Lost Cities')).toBeVisible();
    expect(screen.getByText('Dominion')).toBeVisible();
    expect(screen.getByText(/Our Collection/)).not.toBeVisible();
    expect(document.querySelectorAll('#collection')).toHaveLength(1);
    expect(document.getElementById('collection')).toHaveClass('wishlist');
  });

  it('the toggle switches between the two lists without refetching either', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderApp();
    // Both sections have loaded (the wishlist body mounts after suggestions).
    expect(await screen.findByText('Lost Cities')).not.toBeVisible();
    const requestsAfterLoad = fetchSpy.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'We want' }));
    expect(screen.getByText('Lost Cities')).toBeVisible();
    expect(screen.getByText(/Our Collection/)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'We own' }));
    expect(screen.getByText(/Our Collection/)).toBeVisible();
    expect(screen.getByText('Lost Cities')).not.toBeVisible();

    expect(fetchSpy.mock.calls.length).toBe(requestsAfterLoad);
  });

  it('toggling keeps the scroll position and hands focus to the twin control', async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    renderApp();
    await screen.findByText('Lost Cities');
    scrollTo.mockClear();

    const wantInCollectionHeader = screen.getByRole('button', { name: 'We want' });
    wantInCollectionHeader.focus();
    fireEvent.click(wantInCollectionHeader);

    // The clicked control is now inside a hidden section; its twin in the
    // wishlist header (the only visible "We want") takes focus.
    await waitFor(() => expect(screen.getByRole('button', { name: 'We want' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'We want' })).not.toBe(wantInCollectionHeader);
    // The URL update that mirrors the mode is not a page change:
    // ScrollRestoration must not reset the window to the top.
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
