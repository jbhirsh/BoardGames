import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminPanel from '../components/AdminPanel';
import { AuthContext } from '../context/authContextValue';
import { WishlistContext } from '../context/wishlistContextValue';
import { WISHLIST } from '../data/wishlist';
import { GAME_MAX, GAME_MIN, NAME_MAX, NOTE_MAX } from '../data/suggestionLimits';
import type { WishlistItem } from '../data/types';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const PENDING = [
  { id: 'sug-1', game: 'Root', name: 'Alex', note: 'Mean fun' },
  { id: 'sug-2', game: 'Ark Nova', name: 'Sam', note: '' },
];

const FARAWAY = {
  bggId: 385761, name: 'Faraway', year: 2023, min: 2, max: 6, mins: 30,
  desc: 'Explore Alula backwards.', kw: ['card-game', 'quick-play'], img: 'https://cf.geekdo-images.com/faraway.jpg',
};

function mockApi(
  pending: unknown = { items: PENDING },
  mutation: Response = jsonResponse({ item: {} }),
  preview: Response = jsonResponse({ outcome: 'found', details: FARAWAY }),
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/suggestions?action=pending')) return pending instanceof Error ? Promise.reject(pending) : jsonResponse(pending);
    if (init?.method === 'POST' && (JSON.parse(String(init.body)) as { action?: string }).action === 'preview') return preview;
    if (init?.method === 'POST') return mutation;
    return jsonResponse({});
  });
}

const HIDDEN: WishlistItem = {
  id: 'sug-9', name: 'Glyphics', desc: 'Jess thinks we should try this one.', yt: '', players: '',
  min: 1, max: 99, dur: '', mins: 0, kw: [], type: 'suggested', awards: [],
  suggestedBy: 'Jess', source: 'friend', blurb: '',
};

function renderPanel(hidden: WishlistItem[] = []) {
  const reload = vi.fn();
  const auth = { admin: true, loaded: true, requestLink: vi.fn(), logout: vi.fn() };
  render(
    <AuthContext.Provider value={auth}>
      <WishlistContext.Provider value={{ items: [], hidden, loaded: true, reload }}><AdminPanel /></WishlistContext.Provider>
    </AuthContext.Provider>,
  );
  return reload;
}

const postBodies = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST').map((c) => JSON.parse((c[1] as RequestInit).body as string));

describe('AdminPanel', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('lists the queue with each suggester and note', async () => {
    mockApi();
    renderPanel();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('Root')).toBeInTheDocument();
    expect(screen.getByText(/from Alex: “Mean fun”/)).toBeInTheDocument();
    expect(screen.getByText(/from Sam$/)).toBeInTheDocument();
  });

  it('approves as JSON, drops the row and reloads the wishlist', async () => {
    const spy = mockApi();
    const reload = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Root' }));
    await waitFor(() => expect(screen.queryByText('Root')).not.toBeInTheDocument());
    expect(postBodies(spy)).toEqual([{ decision: 'approve', id: 'sug-1' }]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ark Nova')).toBeInTheDocument();
  });

  it('denies without reloading, and says when the queue is empty', async () => {
    const spy = mockApi({ items: [PENDING[0]] });
    const reload = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Deny Root' }));
    expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
    expect(postBodies(spy)).toEqual([{ decision: 'deny', id: 'sug-1' }]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports a failed decision and a failed queue load', async () => {
    mockApi({ items: PENDING }, jsonResponse({ error: 'Root was already denied' }, false));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Root' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Root was already denied');
    expect(screen.getByText('Root')).toBeInTheDocument();
    vi.restoreAllMocks();

    mockApi(new Error('offline'));
    renderPanel();
    expect(await screen.findByText(/Couldn't load the queue/)).toBeInTheDocument();
  });

  it('bounds each field of the add form as the API does', async () => {
    mockApi({ items: [] });
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    expect(within(form).getByLabelText('Game')).toHaveAttribute('minlength', String(GAME_MIN));
    expect(within(form).getByLabelText('Game')).toHaveAttribute('maxlength', String(GAME_MAX));
    expect(within(form).getByLabelText('Added by')).toHaveAttribute('maxlength', String(NAME_MAX));
    expect(within(form).getByLabelText(/Note/)).toHaveAttribute('maxlength', String(NOTE_MAX));
  });

  it('looks a game up first, shows what BoardGameGeek has, then adds it with those details', async () => {
    localStorage.setItem('gameroom:name', 'Jess H');
    const spy = mockApi({ items: [] });
    const reload = renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    expect(within(form).getByLabelText('Added by')).toHaveValue('Jess H');
    // A game the compiled wishlist doesn't already carry; the form refuses those.
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: ' Faraway ' } });
    fireEvent.change(within(form).getByLabelText('Section'), { target: { value: 'heavy' } });
    fireEvent.change(within(form).getByLabelText(/Note/), { target: { value: 'Card drafting' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Look up' }));

    expect(await within(form).findByText('Explore Alula backwards.')).toBeInTheDocument();
    expect(within(form).getByText('(2023)')).toBeInTheDocument();
    expect(within(form).getByText('2–6 players · 30 min')).toBeInTheDocument();
    expect(within(within(form).getByRole('list', { name: 'Keywords' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Card Game', 'Quick Play']);
    expect(within(form).getByRole('presentation')).toHaveAttribute('src', FARAWAY.img);
    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(within(form).getByRole('button', { name: 'Add to wishlist' }));
    await waitFor(() => expect(within(form).getByRole('status')).toHaveTextContent('Faraway is on the wishlist.'));
    const stored = { bggId: 385761, year: 2023, min: 2, max: 6, mins: 30, desc: 'Explore Alula backwards.', kw: ['card-game', 'quick-play'], img: FARAWAY.img };
    expect(postBodies(spy)).toEqual([
      { action: 'preview', game: 'Faraway' },
      { action: 'add', game: 'Faraway', name: 'Jess H', note: 'Card drafting', type: 'heavy', details: stored },
    ]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(within(form).getByLabelText('Game')).toHaveValue('');
    expect(within(form).queryByText('Explore Alula backwards.')).not.toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Look up' })).toBeInTheDocument();
  });

  it('can file a game under the friends section, and refuses a bad name before posting', async () => {
    const spy = mockApi({ items: [] });
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Faraway' } });
    fireEvent.change(within(form).getByLabelText('Section'), { target: { value: '' } });
    fireEvent.change(within(form).getByLabelText('Added by'), { target: { value: '!!' } });
    fireEvent.submit(form);
    expect(within(form).getByRole('status')).toHaveTextContent('Use 1–30 letters');
    expect(postBodies(spy)).toEqual([]);

    fireEvent.change(within(form).getByLabelText('Added by'), { target: { value: 'Jess' } });
    fireEvent.submit(form);
    await within(form).findByRole('button', { name: 'Add to wishlist' });
    fireEvent.submit(form);
    await waitFor(() => expect(postBodies(spy)).toHaveLength(2));
    expect(postBodies(spy)[1]).toMatchObject({ action: 'add', game: 'Faraway', name: 'Jess', note: '' });
    expect(postBodies(spy)[1]).not.toHaveProperty('type');
  });

  it('says on the form why BoardGameGeek found nothing, and can add the game anyway without details', async () => {
    const spy = mockApi({ items: [] }, jsonResponse({ item: {} }), jsonResponse({ outcome: 'no-match' }));
    const reload = renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Magical Athlete' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Look up' }));
    const notice = await within(form).findByText(/^BoardGameGeek had no match for “Magical Athlete”\. Check the name/);
    expect(notice.closest('.notice')).toHaveClass('notice-warning');
    // The lookup's area is the live region, so the notice carries no role of its own.
    expect(notice.closest('.notice')).not.toHaveAttribute('role');
    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(within(form).getByRole('button', { name: 'Add anyway' }));
    await waitFor(() => expect(within(form).getByRole('status')).toHaveTextContent('Magical Athlete is on the wishlist.'));
    expect(postBodies(spy)[1]).toEqual({ action: 'add', game: 'Magical Athlete', name: 'Jess', note: '', type: 'strategy', details: null });
    expect(within(form).queryByText(/had no match/)).not.toBeInTheDocument();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('looks up again on request, and sets an answer aside once the name changes', async () => {
    const spy = mockApi({ items: [] }, jsonResponse({ item: {} }), jsonResponse({ outcome: 'unavailable' }));
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Magical Athlete' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Look up' }));
    expect(await within(form).findByText(/^BoardGameGeek didn't answer for “Magical Athlete”/)).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Look up again' }));
    await waitFor(() => expect(postBodies(spy)).toEqual([{ action: 'preview', game: 'Magical Athlete' }, { action: 'preview', game: 'Magical Athlete' }]));
    await within(form).findByRole('button', { name: 'Add anyway' });

    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Magical Athletes' } });
    expect(within(form).queryByText(/didn't answer/)).not.toBeInTheDocument();
    expect(within(form).queryByRole('button', { name: 'Look up again' })).not.toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Look up' })).toBeInTheDocument();
  });

  it('names a missing or refused token on the form', async () => {
    mockApi({ items: [] }, jsonResponse({ item: {} }), jsonResponse({ outcome: 'no-token' }));
    renderPanel();
    let form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Magical Athlete' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Look up' }));
    expect(await within(form).findByText(/the BoardGameGeek token \(BGG_API_TOKEN\) is missing/)).toBeInTheDocument();
    vi.restoreAllMocks();
    cleanup();

    mockApi({ items: [] }, jsonResponse({ item: {} }), jsonResponse({ outcome: 'refused' }));
    renderPanel();
    form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Magical Athlete' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Look up' }));
    expect(await within(form).findByText(/BoardGameGeek refused the request \(check BGG_API_TOKEN\)/)).toBeInTheDocument();
  });

  it('shows the server reason when the lookup itself fails, and stores nothing', async () => {
    const spy = mockApi({ items: [] }, jsonResponse({ item: {} }), jsonResponse({ error: 'owner sign-in required' }, false));
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Faraway' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(within(form).getByRole('status')).toHaveTextContent('owner sign-in required'));
    expect(within(form).getByRole('button', { name: 'Look up' })).toBeEnabled();
    expect(postBodies(spy)).toEqual([{ action: 'preview', game: 'Faraway' }]);
  });

  it('says one player, and leaves out an unknown time', async () => {
    mockApi({ items: [] }, jsonResponse({ item: {} }), jsonResponse({ outcome: 'found', details: { ...FARAWAY, min: 1, max: 1, mins: 0, year: undefined, img: undefined, kw: [], desc: '' } }));
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Faraway' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Look up' }));
    expect(await within(form).findByText('1 player')).toBeInTheDocument();
    expect(within(form).queryByRole('presentation')).not.toBeInTheDocument();
    expect(within(form).queryByRole('list', { name: 'Keywords' })).not.toBeInTheDocument();
  });

  it('shows the server reason when adding fails', async () => {
    mockApi({ items: [] }, jsonResponse({ error: 'Root is already on the list' }, false));
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Root' } });
    fireEvent.submit(form);
    await within(form).findByRole('button', { name: 'Add to wishlist' });
    fireEvent.submit(form);
    await waitFor(() => expect(within(form).getByRole('status')).toHaveTextContent('Root is already on the list'));
  });

  it('lists a stored entry the compiled wishlist already covers, with its controls', async () => {
    mockApi({ items: [] });
    renderPanel([HIDDEN]);
    expect(await screen.findByText('Already on the wishlist')).toBeInTheDocument();
    expect(screen.getByText(/Stored entry for a game the wishlist already lists/)).toBeInTheDocument();
    expect(screen.getByText('Glyphics')).toBeInTheDocument();
    expect(screen.getByText(/from Jess$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Glyphics' })).toBeInTheDocument();
  });

  it('reads as a list when more than one entry is held back', async () => {
    mockApi({ items: [] });
    renderPanel([HIDDEN, { ...HIDDEN, id: 'sug-8', name: 'Lovestruck', suggestedBy: undefined }]);
    expect(await screen.findByText(/Stored entries for games the wishlist already lists/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Lovestruck' })).toBeInTheDocument();
    expect(screen.queryByText(/from Jess$/)).toBeInTheDocument();
  });

  it('refuses to add a game the wishlist already lists, before posting', async () => {
    const spy = mockApi({ items: [] });
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: WISHLIST[0].name.toUpperCase() } });
    fireEvent.submit(form);
    expect(within(form).getByRole('status')).toHaveTextContent(`${WISHLIST[0].name} is already on the wishlist.`);
    expect(postBodies(spy)).toEqual([]);
  });

  it('says nothing about duplicates when there are none', async () => {
    mockApi({ items: [] });
    renderPanel();
    expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
    expect(screen.queryByText('Already on the wishlist')).not.toBeInTheDocument();
  });

  it('says when an approved suggestion got no details, and clears it on the next decision', async () => {
    mockApi({ items: PENDING }, jsonResponse({ item: {}, lookup: 'unavailable' }));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Root' }));
    const notice = await screen.findByText(/^Approved, but BoardGameGeek didn't answer for “Root”/);
    // The queue is the live region, so the notice itself carries no role.
    expect(notice.closest('.notice')).not.toHaveAttribute('role');
    fireEvent.click(screen.getByRole('button', { name: 'Deny Ark Nova' }));
    await waitFor(() => expect(screen.queryByText(/^Approved, but/)).not.toBeInTheDocument());
  });
});
