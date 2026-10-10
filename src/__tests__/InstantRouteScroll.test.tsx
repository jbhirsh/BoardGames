import { afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, Link, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import InstantRouteScroll from '../components/InstantRouteScroll';

/** The app's shell: InstantRouteScroll, then ScrollRestoration, over a list and a rules page. */
function renderShell() {
  const router = createMemoryRouter([{
    element: <><InstantRouteScroll /><ScrollRestoration /><Outlet /></>,
    children: [
      { path: '/', element: <Link to="/rules/catan">Catan rules</Link> },
      { path: '/rules/:slug', element: <button type="button" onClick={() => router.navigate(-1)}>Back</button> },
    ],
  }]);
  render(<RouterProvider router={router} />);
  return router;
}

describe('InstantRouteScroll', () => {
  // How the page would scroll at each router scroll: html's CSS says smooth.
  const behaviours: string[] = [];
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
    behaviours.push(document.documentElement.style.scrollBehavior);
  });
  afterEach(() => { behaviours.length = 0; });
  afterAll(() => { scrollTo.mockRestore(); });

  it('moves to a new page at once rather than gliding to its top', () => {
    renderShell();
    behaviours.length = 0;
    act(() => { fireEvent.click(screen.getByRole('link', { name: 'Catan rules' })); });
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(behaviours).toEqual(['auto']);
    // Smooth again for the page's own jumps once it is in place.
    expect(document.documentElement.style.scrollBehavior).toBe('');
  });

  it('puts the list back at once on Back rather than gliding there from the top', () => {
    renderShell();
    act(() => { fireEvent.click(screen.getByRole('link', { name: 'Catan rules' })); });
    behaviours.length = 0;
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Back' })); });
    expect(screen.getByRole('link', { name: 'Catan rules' })).toBeInTheDocument();
    expect(behaviours).toEqual(['auto']);
    expect(document.documentElement.style.scrollBehavior).toBe('');
    expect(scrollTo).toHaveBeenCalled();
  });
});
