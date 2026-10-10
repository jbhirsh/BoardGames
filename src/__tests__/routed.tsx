import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router';

/**
 * Renders `element` at `path` in a memory data router, starting on the last
 * of `entries`, and returns the router. Its `state` then shows where a link
 * went, with what location state, and whether it pushed, replaced or went
 * back (`historyAction`). Anywhere else renders nothing.
 */
export function renderRouted(element: ReactElement, entries: InitialEntry[] = ['/'], path = '/') {
  const router = createMemoryRouter(
    [{ path, element }, { path: '*', element: null }],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  );
  render(<RouterProvider router={router} />);
  return router;
}
