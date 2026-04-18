import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import Wishlist from '../components/Wishlist';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { WISHLIST } from '../data/wishlist';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function mockVotes(counts: Record<string, number>, myVotes: string[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ counts, myVotes }));
}

function renderWishlist() {
  return render(
    <FilterProvider>
      <Wishlist />
    </FilterProvider>,
  );
}

describe('Wishlist', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('wishlist:anonId', 'anon-testtest');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all wishlist items in the default list layout', async () => {
    mockVotes({});
    renderWishlist();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    for (const item of WISHLIST) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
      expect(screen.getByText(item.desc)).toBeInTheDocument();
    }
  });

  it('shows vote counts next to each item', async () => {
    const counts = Object.fromEntries(WISHLIST.map((w, i) => [w.id, i + 1]));
    mockVotes(counts);
    renderWishlist();
    await waitFor(() => {
      for (const item of WISHLIST) {
        const btn = screen.getByRole('button', { name: new RegExp(`Vote for ${item.name}`) });
        expect(btn).toHaveTextContent(String(counts[item.id]));
      }
    });
  });

  it('sorts items by vote count, highest first', async () => {
    const byId = Object.fromEntries(WISHLIST.map((w, i) => [w.id, WISHLIST.length - i]));
    // Reverse the order: first item in WISHLIST gets the highest count.
    // Shuffle so sort actually has work to do: give a middle item the top score.
    const counts: Record<string, number> = {};
    WISHLIST.forEach((w, i) => { counts[w.id] = i === 2 ? 999 : byId[w.id]; });
    mockVotes(counts);
    renderWishlist();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names[0]).toBe(WISHLIST[2].name);
  });

  it('switches to list layout when the filter view is set to list', async () => {
    mockVotes({});
    function ViewToggleTest() {
      const { dispatch } = useFilter();
      return (
        <>
          <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'grid' })}>grid</button>
          <button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'list' })}>list</button>
          <Wishlist />
        </>
      );
    }
    const { container } = render(
      <FilterProvider>
        <ViewToggleTest />
      </FilterProvider>,
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    // Default view is 'list' per initialFilterState
    expect(container.querySelector('.wish-list')).toBeInTheDocument();

    fireEvent.click(screen.getByText('grid'));
    expect(container.querySelector('.wish-grid')).toBeInTheDocument();
    expect(container.querySelector('.wish-list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('list'));
    expect(container.querySelector('.wish-list')).toBeInTheDocument();
  });

  it('POSTs a vote when the vote button is clicked', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ counts: { [WISHLIST[0].id]: 0 }, myVotes: [] }))
      .mockResolvedValueOnce(jsonResponse({ itemId: WISHLIST[0].id, count: 1, myVote: 1 }));

    renderWishlist();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    const item = screen.getAllByTestId('wishlist-item')
      .find((el) => el.getAttribute('data-item-id') === WISHLIST[0].id)!;
    const voteBtn = within(item).getByRole('button', { name: /Vote for/ });

    fireEvent.click(voteBtn);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    const postCall = fetchSpy.mock.calls[1];
    expect(postCall[0]).toBe('/api/votes');
    expect(JSON.parse(postCall[1]!.body as string)).toMatchObject({
      itemId: WISHLIST[0].id,
      vote: 1,
    });
  });
});
