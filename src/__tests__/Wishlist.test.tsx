import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Wishlist from '../components/Wishlist';
import { FilterProvider } from '../context/FilterContext';
import { WishlistProvider } from '../context/WishlistContext';
import { AuthContext } from '../context/authContextValue';
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
    return jsonResponse({ counts, myVotes });
  });
}

function renderWishlist(url = '/?c=want', hidden = false, admin = false) {
  const auth = { admin, loaded: true, requestLink: vi.fn(async () => ({ ok: true as const })), logout: vi.fn(async () => {}) };
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FilterProvider>
        <AuthContext.Provider value={auth}>
          <WishlistProvider>
            <Wishlist hidden={hidden} />
          </WishlistProvider>
        </AuthContext.Provider>
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

  it('groups items by type under the group sort, in the configured type order', async () => {
    mockVotes({});
    renderWishlist('/?c=want&s=group');
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

  it('sorts items within a group by vote count under the group sort, highest first', async () => {
    const byId = Object.fromEntries(WISHLIST.map((w, i) => [w.id, WISHLIST.length - i]));
    // Give the last item of the first group the top score so sort has work to do.
    const firstType = WISHLIST_TYPE_ORDER.find((t) => WISHLIST.some((w) => w.type === t))!;
    const inGroup = WISHLIST.filter((w) => w.type === firstType);
    const star = inGroup[inGroup.length - 1];
    const counts: Record<string, number> = {};
    WISHLIST.forEach((w) => { counts[w.id] = w.id === star.id ? 999 : byId[w.id]; });
    mockVotes(counts);
    renderWishlist('/?c=want&s=group');

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

  it('lists items flat in A to Z order under the default sort', async () => {
    mockVotes({});
    renderWishlist();
    await screen.findByText(WISHLIST[0].name);
    expect(document.querySelectorAll('.wish-group-hd')).toHaveLength(0);
    // Flat layout: item headings sit directly under the section h2, so they are h3.
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '').filter((n) => n !== 'Suggest a game');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('applies the filter bar: search, players, and an empty state with a clear button', async () => {
    mockVotes({});
    renderWishlist('/?c=want&q=wingspan');
    await screen.findByText('Wingspan');
    expect(screen.queryByText('Dominion')).not.toBeInTheDocument();
    expect(screen.getByText(/\b2 titles\b/)).toBeInTheDocument();
    cleanup();

    mockVotes({});
    renderWishlist('/?c=want&p=12');
    await screen.findByText('Wavelength');
    expect(screen.queryByText('Lost Cities')).not.toBeInTheDocument();
    cleanup();

    mockVotes({});
    renderWishlist('/?c=want&q=zzzz-no-such-game');
    await screen.findByText('No wishlist games match your filters.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByText(WISHLIST[0].name);
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
      <MemoryRouter initialEntries={['/?c=want']}>
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
    renderWishlist('/?c=want&s=group');
    await waitFor(() => expect(screen.getByText('Root')).toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 3, name: 'Suggested by friends' })).toBeInTheDocument();
    expect(screen.getByText('Suggested by Alex')).toBeInTheDocument();
    expect(screen.getByText('“Mean fun”')).toBeInTheDocument();
    expect(screen.getByText(`${WISHLIST.length + 1} titles`)).toBeInTheDocument();
    // Votes were requested for the suggestion too. The request goes out
    // from a passive effect after the body mounts, so wait for it rather
    // than reading the calls the instant the name appears.
    const voteCall = () => (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0])).find((u) => u.startsWith('/api/votes?'));
    await waitFor(() => expect(voteCall()).toBeDefined());
    expect(voteCall()).toContain('sug-abc123');
  });

  it('filters the header count while suggestions are still loading', async () => {
    // Suggestions never settle here, so the body never mounts; the count
    // must still reflect the search from the URL rather than the full total.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    renderWishlist(`/?c=want&q=${encodeURIComponent(WISHLIST[0].name)}`);
    expect(screen.getByText('1 titles')).toBeInTheDocument();
    expect(screen.queryByText(`${WISHLIST.length} titles`)).not.toBeInTheDocument();
    expect(screen.queryByText(WISHLIST[0].name)).not.toBeInTheDocument();
  });

  it('hides itself and drops the anchor id when the collection is showing', async () => {
    mockVotes({});
    const { container } = renderWishlist('/', true);
    const section = container.querySelector('section.wishlist')!;
    expect(section).toHaveAttribute('hidden');
    expect(section).not.toHaveAttribute('id');
    expect(await screen.findByText(WISHLIST[0].name)).not.toBeVisible();
  });

  it('shows the suggestion form but no owner tools when signed out', async () => {
    mockVotes({});
    renderWishlist();
    expect(await screen.findByRole('form', { name: 'Suggest a game' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Owner tools' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
  });

  it('shows the owner tools and per-entry controls for stored entries when signed in', async () => {
    const fetchSpy = mockVotes({}, [], [{ id: 'sug-abc123', game: 'Root', name: 'Alex', note: '' }]);
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/api/suggestions?action=pending')) return jsonResponse({ items: [{ id: 'sug-p', game: 'Ark Nova', name: 'Sam', note: '' }] });
      if (url.startsWith('/api/suggestions')) return jsonResponse({ items: [{ id: 'sug-abc123', game: 'Root', name: 'Alex', note: '' }] });
      return jsonResponse({ counts: {}, myVotes: [] });
    });
    renderWishlist('/?c=want', false, true);
    expect(await screen.findByRole('region', { name: 'Owner tools' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Approve Ark Nova' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit Root' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Root' })).toBeInTheDocument();
    // Compiled-in entries are edited in the source, not here.
    expect(screen.queryByRole('button', { name: `Edit ${WISHLIST[0].name}` })).not.toBeInTheDocument();
  });
});
