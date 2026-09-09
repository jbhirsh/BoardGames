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

type Suggested = { id: string; game: string; name: string; note: string };

function mockVotes(counts: Record<string, number>, myVotes: string[] = [], suggestions: Suggested[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith('/api/suggestions')) return jsonResponse({ items: suggestions });
    if (url.startsWith('/api/owners')) return jsonResponse({ owners: {}, mine: [] });
    return jsonResponse({ counts, myVotes });
  });
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
    await screen.findByText(WISHLIST[0].name);
    for (const item of WISHLIST) {
      expect(screen.getByText(item.name)).toBeInTheDocument();
      expect(screen.getByText(item.desc)).toBeInTheDocument();
    }
  });

  it('shows vote counts next to each item', async () => {
    const counts = Object.fromEntries(WISHLIST.map((w, i) => [w.id, i + 1]));
    mockVotes(counts);
    renderWishlist();
    await screen.findByText(WISHLIST[0].name);
    await waitFor(() => {
      for (const item of WISHLIST) {
        // Match the full label: an unanchored prefix would also hit an item
        // whose name extends this one (e.g. a base game and its expansion).
        // Scoped to the item's own row so the accessible-name computation
        // covers a handful of elements, not every control on the page.
        const n = counts[item.id];
        const row = document.querySelector(`[data-item-id="${item.id}"]`) as HTMLElement;
        const btn = within(row).getByRole('button', { name: `Vote for ${item.name} (${n} ${n === 1 ? 'vote' : 'votes'})` });
        expect(btn).toHaveTextContent(String(n));
      }
    });
  });

  it('groups items by type, in the configured type order', async () => {
    mockVotes({});
    renderWishlist();
    await screen.findByText(WISHLIST[0].name);

    // Group headings only: the suggestion form has its own h3.
    const headings = Array.from(document.querySelectorAll('.wish-group-hd')).map((h) => h.textContent);
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

    await waitFor(() => {
      const first = screen.getAllByRole('heading', { level: 4 })[0]?.textContent;
      expect(first).toBe(star.name);
    });
    const names = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
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

    await screen.findByText(WISHLIST[0].name);
    // Default view is 'list' per initialFilterState
    expect(container.querySelector('.wish-list')).toBeInTheDocument();

    fireEvent.click(screen.getByText('grid'));
    expect(container.querySelector('.wish-grid')).toBeInTheDocument();
    expect(container.querySelector('.wish-list')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('list'));
    expect(container.querySelector('.wish-list')).toBeInTheDocument();
  });

  it('POSTs a vote when the vote button is clicked', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.startsWith('/api/suggestions')) return jsonResponse({ items: [] });
      if (url.startsWith('/api/owners')) return jsonResponse({ owners: {}, mine: [] });
      if (init?.method === 'POST') return jsonResponse({ itemId: WISHLIST[0].id, count: 1, myVote: 1 });
      return jsonResponse({ counts: { [WISHLIST[0].id]: 0 }, myVotes: [] });
    });
    const postCalls = () => fetchSpy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST');

    renderWishlist();
    await screen.findByText(WISHLIST[0].name);

    const item = screen.getAllByTestId('wishlist-item')
      .find((el) => el.getAttribute('data-item-id') === WISHLIST[0].id)!;
    const voteBtn = within(item).getByRole('button', { name: /Vote for/ });
    await waitFor(() => expect(voteBtn).toBeEnabled());

    fireEvent.click(voteBtn);

    await waitFor(() => expect(postCalls()).toHaveLength(1));
    const postCall = postCalls()[0];
    expect(postCall[0]).toBe('/api/votes');
    expect(JSON.parse(postCall[1]!.body as string)).toMatchObject({
      itemId: WISHLIST[0].id,
      vote: 1,
    });
  });

  it('renders approved friend suggestions in their own group with the suggester credited', async () => {
    mockVotes({}, [], [{ id: 'sug-abc123', game: 'Root', name: 'Alex', note: 'Mean fun' }]);
    renderWishlist();
    await waitFor(() => expect(screen.getByText('Root')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 3, name: 'Suggested by friends' })).toBeInTheDocument();
    expect(screen.getByText('Suggested by Alex')).toBeInTheDocument();
    expect(screen.getByText('“Mean fun”')).toBeInTheDocument();
    expect(screen.getByText(`${WISHLIST.length + 1} titles`)).toBeInTheDocument();
    // Votes were requested for the suggestion too.
    const voteCall = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0])).find((u) => u.startsWith('/api/votes?'));
    expect(voteCall).toContain('sug-abc123');
  });

  it('shows the suggestion form', async () => {
    mockVotes({});
    renderWishlist();
    expect(await screen.findByRole('form', { name: 'Suggest a game' })).toBeInTheDocument();
  });
});
