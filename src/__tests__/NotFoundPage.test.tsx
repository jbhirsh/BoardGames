import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import * as Sentry from '@sentry/react';
import NotFoundPage, { RouteError } from '../components/NotFoundPage';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));

function Boom(): never {
  throw new Error('render failed');
}

// The same shape as main.tsx: an error element on the root, a catch-all child.
function renderAt(path: string) {
  const router = createMemoryRouter([
    {
      path: '/',
      errorElement: <RouteError />,
      children: [
        { index: true, element: <p>Home</p> },
        { path: 'boom', element: <Boom /> },
        { path: 'gone', loader: () => { throw new Response('', { status: 404 }); }, element: <p>Never</p> },
        { path: 'broken', loader: () => { throw new Response('', { status: 500 }); }, element: <p>Never</p> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ], { initialEntries: [path] });
  return render(<RouterProvider router={router} />);
}

describe('NotFoundPage', () => {
  beforeEach(() => vi.mocked(Sentry.captureException).mockClear());

  it('answers an unknown address with a styled page that links home', async () => {
    renderAt('/no-such-page');
    expect(await screen.findByRole('heading', { level: 1, name: 'This box is empty' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Browse the collection' }));
    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  it('takes a title and message', () => {
    render(
      <RouterProvider router={createMemoryRouter([{ path: '/', element: <NotFoundPage title="Game not found" message="No rules here." /> }])} />,
    );
    expect(screen.getByRole('heading', { name: 'Game not found' })).toBeInTheDocument();
    expect(screen.getByText('No rules here.')).toBeInTheDocument();
  });

  it('shows a thrown 404 as not found without reporting it', async () => {
    renderAt('/gone');
    expect(await screen.findByRole('heading', { name: 'This box is empty' })).toBeInTheDocument();
    // Let the effect that would report run first, or this passes either way.
    await act(async () => {});
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports any other error and says something went wrong', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderAt('/boom');
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    // Reported from an effect, which can run just after the heading shows.
    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'render failed' })));
    expect(screen.getByRole('link', { name: 'Browse the collection' })).toHaveAttribute('href', '/');
  });

  it('treats a thrown response other than 404 as an error and reports it', async () => {
    renderAt('/broken');
    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ status: 500 })));
  });

  it('keeps the page out of search results', () => {
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <NotFoundPage /> }])} />);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });
});
