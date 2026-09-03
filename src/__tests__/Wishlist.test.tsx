import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Wishlist from '../components/Wishlist';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { WISHLIST } from '../data/wishlist';
import { WISHLIST_TYPES, WISHLIST_TYPE_ORDER } from '../data/keywords';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function mockVotes(counts: Record<string, number>, myVotes: string[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ counts, myVotes }));
}

function renderWishlist() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <Wishlist />
      </FilterProvider>
    </MemoryRouter>,
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
        // Match the full label: an unanchored prefix would also hit an item
        // whose name extends this one (e.g. a base game and its expansion).
        const n = counts[item.id];
        const btn = screen.getByRole('button', { name: `Vote for ${item.name} (${n} ${n === 1 ? 'vote' : 'votes'})` });
        expect(btn).toHaveTextContent(String(n));
      }
    });
  });

  it('groups items by type, in the configured type order', async () => {
    mockVotes({});
    renderWishlist();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const expected = WISHLIST_TYPE_ORDER
      .filter((t) => WISHLIST.some((w) => w.type === t))
      .map((t) => WISHLIST_TYPES[t]);
    expect(headings).toEqual(expected);

    // Every item rendered under a group heading has that group's type.
    for (const group of document.querySelectorAll('.wish-group')) {
      const label = group.querySelector('h3')!.textContent;
      const ids = Array.from(group.querySelectorAll('[data-item-id]')).map((el) => el.getAttribute('data-item-id'));
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(WISHLIST_TYPES[WISHLIST.find((w) => w.id === id)!.type]).toBe(label);
      }
    }
  });

  it('sorts items within a group by vote count, highest first', async () => {
    const byId = Object.fromEntries(WISHLIST.map((w, i) => [w.id, WISHLIST.length - i]));
    // Give the last item of the first group the top score so sort has work to do.
    const firstType = WISHLIST_TYPE_ORDER.find((t) => WISHLIST.some((w) => w.type === t))!;
    const inGroup = WISHLIST.filter((w) => w.type === firstType);
    const star = inGroup[inGroup.length - 1];
    const counts: Record<string, number> = {};
    WISHLIST.forEach((w) => { counts[w.id] = w.id === star.id ? 999 : byId[w.id]; });
    mockVotes(counts);
    renderWishlist();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const names = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(names[0]).toBe(star.name);
    // The rest of that group follows in descending vote order.
    const groupNames = names.slice(0, inGroup.length);
    const groupCounts = groupNames.map((n) => counts[WISHLIST.find((w) => w.name === n)!.id]);
    expect(groupCounts).toEqual([...groupCounts].sort((a, b) => b - a));
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
      <MemoryRouter>
        <FilterProvider>
          <ViewToggleTest />
        </FilterProvider>
      </MemoryRouter>,
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
