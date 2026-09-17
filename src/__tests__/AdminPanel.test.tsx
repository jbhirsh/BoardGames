import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminPanel from '../components/AdminPanel';
import { AuthContext } from '../context/authContextValue';
import { WishlistContext } from '../context/wishlistContextValue';
import { WISHLIST } from '../data/wishlist';
import type { WishlistItem } from '../data/types';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const PENDING = [
  { id: 'sug-1', game: 'Root', name: 'Alex', note: 'Mean fun' },
  { id: 'sug-2', game: 'Ark Nova', name: 'Sam', note: '' },
];

function mockApi(pending: unknown = { items: PENDING }, mutation: Response = jsonResponse({ item: {} })) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/suggestions?action=pending')) return pending instanceof Error ? Promise.reject(pending) : jsonResponse(pending);
    if (init?.method === 'POST') return mutation;
    return jsonResponse({});
  });
}

const HIDDEN: WishlistItem = {
  id: 'sug-9', name: 'Glyphics', desc: 'Jess thinks we should try this one.', yt: '', players: '',
  min: 1, max: 99, dur: '', mins: 0, cat: 'medium', kw: [], type: 'suggested', awards: [],
  suggestedBy: 'Jess', source: 'friend',
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

  it('adds a game with the chosen section, remembers the name and reloads', async () => {
    localStorage.setItem('gameroom:name', 'Jess H');
    const spy = mockApi({ items: [] });
    const reload = renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    expect(within(form).getByLabelText('Added by')).toHaveValue('Jess H');
    // A game the compiled wishlist doesn't already carry; the form refuses those.
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: ' Faraway ' } });
    fireEvent.change(within(form).getByLabelText('Section'), { target: { value: 'heavy' } });
    fireEvent.change(within(form).getByLabelText(/Note/), { target: { value: 'Card drafting' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add to wishlist' }));
    await waitFor(() => expect(within(form).getByRole('status')).toHaveTextContent('Faraway is on the wishlist.'));
    expect(postBodies(spy)).toEqual([{ action: 'add', game: 'Faraway', name: 'Jess H', note: 'Card drafting', type: 'heavy' }]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(within(form).getByLabelText('Game')).toHaveValue('');
  });

  it('can file a game under the friends section, and refuses a bad name before posting', async () => {
    const spy = mockApi({ items: [] });
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Root' } });
    fireEvent.change(within(form).getByLabelText('Section'), { target: { value: '' } });
    fireEvent.change(within(form).getByLabelText('Added by'), { target: { value: '!!' } });
    fireEvent.submit(form);
    expect(within(form).getByRole('status')).toHaveTextContent('Use 1–30 letters');
    expect(postBodies(spy)).toEqual([]);

    fireEvent.change(within(form).getByLabelText('Added by'), { target: { value: 'Jess' } });
    fireEvent.submit(form);
    await waitFor(() => expect(postBodies(spy)).toEqual([{ action: 'add', game: 'Root', name: 'Jess', note: '' }]));
  });

  it('shows the server reason when adding fails', async () => {
    mockApi({ items: [] }, jsonResponse({ error: 'Root is already on the list' }, false));
    renderPanel();
    const form = await screen.findByRole('form', { name: 'Add a game' });
    fireEvent.change(within(form).getByLabelText('Game'), { target: { value: 'Root' } });
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
});
