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

/** What an entry keeps of FARAWAY's preview: everything but BGG's name for it. */
const FARAWAY_STORED = { bggId: 385761, year: 2023, min: 2, max: 6, mins: 30, desc: 'Explore Alula backwards.', kw: ['card-game', 'quick-play'], img: FARAWAY.img };

type PreviewAnswer = Response | ((game: string, signal?: AbortSignal) => Response | Promise<Response>);

function mockApi(
  pending: unknown = { items: PENDING },
  mutation: Response = jsonResponse({ item: {} }),
  preview: PreviewAnswer = jsonResponse({ outcome: 'found', details: FARAWAY }),
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/suggestions?action=pending')) return pending instanceof Error ? Promise.reject(pending) : jsonResponse(pending);
    const body = init?.method === 'POST' ? (JSON.parse(String(init.body)) as { action?: string; game?: string }) : {};
    if (body.action === 'preview') return typeof preview === 'function' ? preview(body.game ?? '', init?.signal ?? undefined) : preview;
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
// The queue looks each suggestion up as it loads, so its decisions are picked out of the posts.
const decisions = (spy: ReturnType<typeof mockApi>) => postBodies(spy).filter((b) => 'decision' in b);
const nameBox = (suggester: string, game: string) => screen.getByRole('textbox', { name: `Game name for ${suggester}'s suggestion “${game}”` });
const lookUpButton = (suggester: string, game: string) => screen.getByRole('button', { name: `Look up the name for ${suggester}'s suggestion “${game}”` });

describe('AdminPanel', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('lists the queue with each suggester and note', async () => {
    mockApi();
    renderPanel();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Root')).toBe(nameBox('Alex', 'Root'));
    expect(screen.getByText(/from Alex: “Mean fun”/)).toBeInTheDocument();
    expect(screen.getByText(/from Sam$/)).toBeInTheDocument();
  });

  it('approves as JSON, drops the row and reloads the wishlist', async () => {
    const spy = mockApi();
    const reload = renderPanel();
    await waitFor(() => expect(screen.getAllByText('Explore Alula backwards.')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Approve Root' }));
    await waitFor(() => expect(screen.queryByDisplayValue('Root')).not.toBeInTheDocument());
    expect(decisions(spy)).toEqual([{ decision: 'approve', id: 'sug-1', details: FARAWAY_STORED }]);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('Ark Nova')).toBeInTheDocument();
  });

  it('denies without reloading, and says when the queue is empty', async () => {
    const spy = mockApi({ items: [PENDING[0]] });
    const reload = renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Deny Root' }));
    expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
    expect(decisions(spy)).toEqual([{ decision: 'deny', id: 'sug-1' }]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reports a failed decision and a failed queue load', async () => {
    mockApi({ items: PENDING }, jsonResponse({ error: 'Root was already denied' }, false));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Root' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Root was already denied');
    expect(screen.getByDisplayValue('Root')).toBeInTheDocument();
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
    // Only the decision's outcome sits in a live region, not the whole queue
    // (whose rows' previews would be read out); it announces the notice, so
    // the notice itself carries no role.
    expect(notice.closest('[aria-live="polite"]')).not.toBeNull();
    expect(notice.closest('.admin-queue')).not.toHaveAttribute('aria-live');
    expect(notice.closest('.notice')).not.toHaveAttribute('role');
    fireEvent.click(screen.getByRole('button', { name: 'Deny Ark Nova' }));
    await waitFor(() => expect(screen.queryByText(/^Approved, but/)).not.toBeInTheDocument());
  });

  describe('the queue\'s previews', () => {
    const ROOT_FOUND = { ...FARAWAY, bggId: 237182, name: 'Root', year: 2018, desc: 'Woodland war.', kw: ['strategy'] };
    const ROOT_STORED = { ...FARAWAY_STORED, bggId: 237182, year: 2018, desc: 'Woodland war.', kw: ['strategy'] };
    const byGame = (answers: Record<string, unknown>) => (game: string) => jsonResponse(answers[game] ?? { outcome: 'no-match' });

    /** A preview that answers only when the test says, keeping the signal it was sent with. */
    function heldPreviews() {
      const held: Array<{ game: string; signal?: AbortSignal; answer: (body: unknown) => void }> = [];
      const preview = (game: string, signal?: AbortSignal) => new Promise<Response>((resolve) => {
        held.push({ game, signal, answer: (body) => resolve(jsonResponse(body)) });
      });
      return { held, preview };
    }

    it('looks the pending games up one at a time in row order, showing each as it comes back, without announcing them', async () => {
      const { held, preview } = heldPreviews();
      const spy = mockApi({ items: PENDING }, jsonResponse({ item: {} }), preview);
      renderPanel();
      await waitFor(() => expect(held.map((h) => h.game)).toEqual(['Root']));
      expect(screen.getByText('Looking up “Root” on BoardGameGeek…')).toBeInTheDocument();
      expect(screen.getByText('Looking up “Ark Nova” on BoardGameGeek…')).toBeInTheDocument();

      held[0].answer({ outcome: 'found', details: ROOT_FOUND });
      expect(await screen.findByText('Woodland war.')).toBeInTheDocument();
      expect(screen.getByText('(2018)')).toBeInTheDocument();
      expect(screen.getByText('2–6 players · 30 min')).toBeInTheDocument();
      await waitFor(() => expect(held.map((h) => h.game)).toEqual(['Root', 'Ark Nova']));
      expect(postBodies(spy)).toEqual([{ action: 'preview', game: 'Root' }, { action: 'preview', game: 'Ark Nova' }]);

      held[1].answer({ outcome: 'no-match' });
      const notice = await screen.findByText(/^BoardGameGeek had no match for “Ark Nova”\. Check the name and look it up again, or approve it and fill in its details with Edit\.$/);
      expect(notice.closest('.notice')).toHaveClass('notice-warning');
      // Every row's preview arrives on load, so none is announced: no live
      // region around it, and no role on the notice.
      expect(notice.closest('[aria-live]')).toBeNull();
      expect(notice.closest('.notice')).not.toHaveAttribute('role');
      expect(screen.queryByText(/^Looking up/)).not.toBeInTheDocument();
    });

    it('lets a row look its name up while it still waits its turn', async () => {
      const { held, preview } = heldPreviews();
      mockApi({ items: PENDING }, jsonResponse({ item: {} }), preview);
      renderPanel();
      await waitFor(() => expect(held).toHaveLength(1));
      fireEvent.click(lookUpButton('Sam', 'Ark Nova'));
      await waitFor(() => expect(held.map((h) => h.game)).toEqual(['Root', 'Ark Nova']));
      held[1].answer({ outcome: 'found', details: FARAWAY });
      expect(await screen.findByText('Explore Alula backwards.')).toBeInTheDocument();
      // Its turn in the line was given up, so Root's answer sends nothing more.
      held[0].answer({ outcome: 'no-match' });
      await screen.findByText(/had no match for “Root”/);
      expect(held).toHaveLength(2);
    });

    it('approves with what the preview found, or with no details when it found nothing', async () => {
      const spy = mockApi({ items: PENDING }, jsonResponse({ item: {} }), byGame({ Root: { outcome: 'found', details: ROOT_FOUND } }));
      renderPanel();
      await screen.findByText('Woodland war.');
      await screen.findByText(/had no match for “Ark Nova”/);
      fireEvent.click(screen.getByRole('button', { name: 'Approve Root' }));
      await waitFor(() => expect(screen.queryByDisplayValue('Root')).not.toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Approve Ark Nova' }));
      expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
      expect(decisions(spy)).toEqual([
        { decision: 'approve', id: 'sug-1', details: ROOT_STORED },
        { decision: 'approve', id: 'sug-2', details: null },
      ]);
    });

    it('leaves the lookup to the server at approval when BoardGameGeek didn\'t answer the preview', async () => {
      const spy = mockApi({ items: [PENDING[0]] }, jsonResponse({ item: {} }), jsonResponse({ outcome: 'unavailable' }));
      renderPanel();
      await screen.findByText(/BoardGameGeek didn't answer for “Root”/);
      fireEvent.click(screen.getByRole('button', { name: 'Approve Root' }));
      expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
      expect(decisions(spy)).toEqual([{ decision: 'approve', id: 'sug-1' }]);
    });

    it('can approve while the preview is still loading, leaving the lookup to the server', async () => {
      const { held, preview } = heldPreviews();
      const spy = mockApi({ items: [PENDING[0]] }, jsonResponse({ item: {} }), preview);
      renderPanel();
      await waitFor(() => expect(held).toHaveLength(1));
      expect(screen.getByRole('button', { name: 'Approve Root' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Approve Root' }));
      expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
      expect(decisions(spy)).toEqual([{ decision: 'approve', id: 'sug-1' }]);
    });

    it('says why the preview itself failed, and then leaves the lookup to the server', async () => {
      const spy = mockApi({ items: [PENDING[0]] }, jsonResponse({ item: {} }), jsonResponse({ error: 'owner sign-in required' }, false));
      renderPanel();
      expect(await screen.findByText('owner sign-in required')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Approve Root' }));
      expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
      expect(decisions(spy)).toEqual([{ decision: 'approve', id: 'sug-1' }]);
    });

    it('aborts the preview still out when the queue goes away, and sends none of those waiting', async () => {
      const { held, preview } = heldPreviews();
      mockApi({ items: PENDING }, jsonResponse({ item: {} }), preview);
      renderPanel();
      await waitFor(() => expect(held).toHaveLength(1));
      expect(held[0].signal?.aborted).toBe(false);
      cleanup();
      expect(held[0].signal?.aborted).toBe(true);
      held[0].answer({ outcome: 'no-match' });
      await new Promise((r) => setTimeout(r, 0));
      expect(held).toHaveLength(1);
    });

    it('corrects a misspelt name: sets the old preview aside, looks the new one up, and approves it under that name', async () => {
      const MISSPELT = { id: 'sug-3', game: 'Arkham Horry', name: 'Robin', note: '' };
      const ARKHAM = { ...FARAWAY, bggId: 15987, name: 'Arkham Horror', year: 2005, desc: 'Investigate Arkham.', kw: ['cooperative'] };
      const spy = mockApi({ items: [MISSPELT] }, jsonResponse({ item: {} }), byGame({ 'Arkham Horror': { outcome: 'found', details: ARKHAM } }));
      const reload = renderPanel();
      await screen.findByText(/had no match for “Arkham Horry”/);

      fireEvent.change(nameBox('Robin', 'Arkham Horry'), { target: { value: ' Arkham Horror ' } });
      expect(screen.queryByText(/had no match/)).not.toBeInTheDocument();
      expect(screen.getByText('Look the corrected name up to check its details; Approve does that first.')).toBeInTheDocument();
      expect(screen.getByText(/from Robin as “Arkham Horry”/)).toBeInTheDocument();

      fireEvent.click(lookUpButton('Robin', 'Arkham Horry'));
      expect(await screen.findByText('Investigate Arkham.')).toBeInTheDocument();
      // Approve and Deny are named by the name as it now stands.
      expect(screen.queryByRole('button', { name: 'Approve Arkham Horry' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Deny Arkham Horror' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Approve Arkham Horror' }));
      expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
      expect(postBodies(spy)).toEqual([
        { action: 'preview', game: 'Arkham Horry' },
        { action: 'preview', game: 'Arkham Horror' },
        { decision: 'approve', id: 'sug-3', game: 'Arkham Horror', details: { ...FARAWAY_STORED, bggId: 15987, year: 2005, desc: 'Investigate Arkham.', kw: ['cooperative'] } },
      ]);
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('looks a corrected name up before approving it, rather than approve with the old preview', async () => {
      const spy = mockApi({ items: [PENDING[0]] }, jsonResponse({ item: {} }), byGame({ Root: { outcome: 'found', details: ROOT_FOUND }, 'Root: Underworld': { outcome: 'no-match' } }));
      renderPanel();
      await screen.findByText('Woodland war.');
      fireEvent.change(nameBox('Alex', 'Root'), { target: { value: 'Root: Underworld' } });
      fireEvent.click(screen.getByRole('button', { name: 'Approve Root: Underworld' }));
      expect(await screen.findByText(/had no match for “Root: Underworld”/)).toBeInTheDocument();
      expect(decisions(spy)).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: 'Approve Root: Underworld' }));
      expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
      expect(decisions(spy)).toEqual([{ decision: 'approve', id: 'sug-1', game: 'Root: Underworld', details: null }]);
    });

    it('sends a corrected name whose lookup is still out without details, so the server looks it up', async () => {
      const { held, preview } = heldPreviews();
      const spy = mockApi({ items: [PENDING[0]] }, jsonResponse({ item: {} }), preview);
      renderPanel();
      await waitFor(() => expect(held).toHaveLength(1));
      fireEvent.change(nameBox('Alex', 'Root'), { target: { value: 'Root: Marauder' } });
      fireEvent.submit(nameBox('Alex', 'Root').closest('form')!);
      await waitFor(() => expect(held).toHaveLength(2));
      // The friend's lookup is set aside once another is asked for.
      expect(held[0].signal?.aborted).toBe(true);
      expect(screen.getByText('Looking up “Root: Marauder” on BoardGameGeek…')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Approve Root: Marauder' }));
      expect(await screen.findByText('Nothing waiting.')).toBeInTheDocument();
      expect(decisions(spy)).toEqual([{ decision: 'approve', id: 'sug-1', game: 'Root: Marauder' }]);
    });

    it('refuses a correction the wishlist already lists, before posting', async () => {
      const spy = mockApi({ items: [PENDING[0]] });
      renderPanel();
      await screen.findByText('Explore Alula backwards.');
      fireEvent.change(nameBox('Alex', 'Root'), { target: { value: WISHLIST[0].name.toLowerCase() } });
      fireEvent.click(screen.getByRole('button', { name: `Approve ${WISHLIST[0].name.toLowerCase()}` }));
      expect(screen.getByText(`${WISHLIST[0].name} is already on the wishlist.`)).toBeInTheDocument();
      expect(decisions(spy)).toEqual([]);
      expect(postBodies(spy)).toEqual([{ action: 'preview', game: 'Root' }]);
      // Editing the name again clears it.
      fireEvent.change(nameBox('Alex', 'Root'), { target: { value: 'Root: The Riverfolk' } });
      expect(screen.queryByText(/is already on the wishlist/)).not.toBeInTheDocument();
    });

    it('names the corrected game when its approval got no details', async () => {
      const { held, preview } = heldPreviews();
      mockApi({ items: [PENDING[0]] }, jsonResponse({ item: {}, lookup: 'no-match' }), preview);
      renderPanel();
      await waitFor(() => expect(held).toHaveLength(1));
      fireEvent.change(nameBox('Alex', 'Root'), { target: { value: 'Root: Marauder' } });
      fireEvent.submit(nameBox('Alex', 'Root').closest('form')!);
      fireEvent.click(screen.getByRole('button', { name: 'Approve Root: Marauder' }));
      expect(await screen.findByText(/^Approved, but BoardGameGeek had no match for “Root: Marauder”/)).toBeInTheDocument();
    });

    it('labels each row\'s name and buttons by the suggestion, so one friend\'s two stay apart, and bounds the name as the API does', async () => {
      mockApi({ items: [PENDING[1], { id: 'sug-4', game: 'Azul', name: 'Sam', note: '' }] });
      renderPanel();
      const box = await screen.findByRole('textbox', { name: "Game name for Sam's suggestion “Ark Nova”" });
      expect(box).toHaveValue('Ark Nova');
      expect(nameBox('Sam', 'Azul')).toHaveValue('Azul');
      expect(box).toHaveAttribute('minlength', String(GAME_MIN));
      expect(box).toHaveAttribute('maxlength', String(GAME_MAX));
      expect(screen.getByRole('button', { name: 'Deny Ark Nova' })).toHaveTextContent(/^Deny$/);
      expect(lookUpButton('Sam', 'Ark Nova')).toHaveTextContent(/^Look up$/);
      expect(lookUpButton('Sam', 'Azul')).toBeInTheDocument();
    });
  });
});
