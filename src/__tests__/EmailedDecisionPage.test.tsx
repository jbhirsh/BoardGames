import { describe, it, expect, vi, afterEach } from 'vitest';

// The page's sign-in for anyone but the owner: Better Auth's client, faked.
vi.mock('../client/auth', () => ({
  signedInEmail: vi.fn(async () => null),
  signInWithGoogle: vi.fn(async () => ({ ok: true })),
  signInWithPasskey: vi.fn(async () => ({ ok: true })),
}));
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import EmailedDecisionPage from '../components/EmailedDecisionPage';
import { AuthContext } from '../context/authContextValue';
import { signInWithGoogle, signedInEmail } from '../client/auth';
import { GAME_MAX, GAME_MIN } from '../data/suggestionLimits';
import { renderRouted } from './routed';
import { gqlError, operations, stubGraphql, type Handlers } from './helpers/graphqlFetch';

const ARKHAM_FOUND = {
  bggId: 15987,
  name: 'Arkham Horror',
  year: 2005,
  min: 1,
  max: 8,
  mins: 240,
  desc: 'Investigate Arkham.',
  kw: ['cooperative', 'thematic'],
  img: 'https://cf.geekdo-images.com/ah.jpg',
  weight: null,
  section: 'coop',
  summary: null,
  honours: [],
};
const ARKHAM = {
  bggId: 15987,
  year: 2005,
  min: 1,
  max: 8,
  mins: 240,
  desc: 'Investigate Arkham.',
  kw: ['cooperative', 'thematic'],
  img: 'https://cf.geekdo-images.com/ah.jpg',
  section: 'coop',
};
const MISSPELT = { game: 'Arkham Horry', name: 'Robin', note: 'Spooky', status: 'PENDING' };

/** The emailed link's suggestion, a preview for each name looked up, and what a decision answers. */
function api({
  suggestion = MISSPELT as Record<string, unknown>,
  preview = (game: string): { outcome: string; details: unknown } =>
    game === 'Arkham Horror' ? { outcome: 'FOUND', details: ARKHAM_FOUND } : { outcome: 'NO_MATCH', details: null },
  decided = { decideSuggestion: { item: { game: 'x' }, lookup: null } } as unknown,
  open,
}: {
  suggestion?: Record<string, unknown>;
  preview?: (game: string) => { outcome: string; details: unknown };
  decided?: unknown;
  open?: Handlers[string];
} = {}) {
  return stubGraphql({
    EmailedSuggestion:
      open ??
      (({ game }) => ({
        emailedSuggestion: { suggestion, preview: preview(String(game ?? suggestion.game)) },
      })),
    DecideByLink: () => decided,
  });
}

/** The page as `admin` (the owner by default) sees it. */
const asOwner = (admin = true) => (
  <AuthContext.Provider value={{ admin, loaded: true, refresh: vi.fn(async () => {}) }}>
    <EmailedDecisionPage />
  </AuthContext.Provider>
);
const visit = (path: string, admin = true) => renderRouted(asOwner(admin), [path], path.split('?')[0]);
const approve = (extra = '') => visit(`/approve?id=sug-aaaaaa${extra}`);
const deny = () => visit('/deny?id=sug-aaaaaa');
const sent = (spy: ReturnType<typeof api>, name: string) => operations(spy).filter((o) => o.operationName === name);

describe('EmailedDecisionPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it("looks the friend's spelling up and shows what it found, deciding nothing until Approve is pressed", async () => {
    const spy = api({ suggestion: { ...MISSPELT, game: 'Arkham Horror' } });
    approve();
    expect(await screen.findByRole('heading', { name: 'Approve Arkham Horror?' })).toBeInTheDocument();
    expect(screen.getByText('Robin', { selector: 'strong' }).parentElement).toHaveTextContent(/^Suggested by Robin$/);
    expect(screen.getByRole('blockquote')).toHaveTextContent('“Spooky”');
    expect(screen.getByText('Investigate Arkham.')).toBeInTheDocument();
    expect(screen.getByText('1–8 players · 240 min')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Keywords' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Cooperative', 'Thematic']);
    expect(screen.getByRole('presentation')).toHaveAttribute('src', ARKHAM_FOUND.img);
    expect(sent(spy, 'EmailedSuggestion').map((o) => o.variables)).toEqual([{ id: 'sug-aaaaaa' }]);
    expect(sent(spy, 'DecideByLink')).toEqual([]);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('heading', { name: 'Approved' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Arkham Horror is now on the wishlist, credited to Robin.');
    expect(sent(spy, 'DecideByLink').map((o) => o.variables)).toEqual([
      { id: 'sug-aaaaaa', decision: 'APPROVE', game: 'Arkham Horror', details: ARKHAM },
    ]);
  });

  it('says why it found nothing, and approves without details, saying so', async () => {
    const spy = api();
    approve();
    expect(
      await screen.findByText(
        'BoardGameGeek had no match for “Arkham Horry”. Approving adds it without details, to fill in with Edit on the site; or correct the name below and look it up again.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Arkham Horry is now on the wishlist, credited to Robin. It has no details yet: sign in on the site to fill them in with Edit.',
    );
    expect(sent(spy, 'DecideByLink')[0].variables).toEqual({
      id: 'sug-aaaaaa',
      decision: 'APPROVE',
      game: 'Arkham Horry',
      details: null,
    });
  });

  it("leaves the details out after an outage, so the approval tries the lookup again, and says what it couldn't fill in", async () => {
    const spy = api({
      preview: () => ({ outcome: 'UNAVAILABLE', details: null }),
      decided: { decideSuggestion: { item: { game: 'Arkham Horry' }, lookup: 'NO_MATCH' } },
    });
    approve();
    expect(
      await screen.findByText(/^BoardGameGeek didn't answer for “Arkham Horry”\. Approving tries again/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Arkham Horry is now on the wishlist, credited to Robin. BoardGameGeek had no match for it',
    );
    expect(sent(spy, 'DecideByLink')[0].variables).not.toHaveProperty('details');
  });

  it('names a missing or refused token', async () => {
    api({ preview: () => ({ outcome: 'NO_TOKEN', details: null }) });
    approve();
    expect(await screen.findByText(/couldn't be looked up: BGG_API_TOKEN isn't set\./)).toBeInTheDocument();
  });

  it('corrects a misspelt name through the address, looking it up again, and approves it under that name', async () => {
    const spy = api();
    const router = approve();
    const box = await screen.findByRole('textbox', { name: 'Wrong game? Correct the name and look it up again.' });
    expect(box).toHaveValue('Arkham Horry');
    expect(box).toHaveAttribute('minlength', String(GAME_MIN));
    expect(box).toHaveAttribute('maxlength', String(GAME_MAX));
    fireEvent.change(box, { target: { value: ' Arkham   Horror ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByRole('heading', { name: 'Approve Arkham Horror?' })).toBeInTheDocument();
    expect(router.state.location).toMatchObject({
      search: '?id=sug-aaaaaa&game=Arkham+Horror',
    });
    expect(screen.getByText('Robin', { selector: 'strong' }).parentElement).toHaveTextContent(
      /^Suggested by Robin as “Arkham Horry”$/,
    );
    expect(screen.getByRole('blockquote')).toHaveTextContent('“Spooky”');
    expect(await screen.findByText('Investigate Arkham.')).toBeInTheDocument();
    expect(sent(spy, 'EmailedSuggestion').at(-1)?.variables).toMatchObject({ game: 'Arkham Horror' });
    expect(sent(spy, 'DecideByLink')).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await screen.findByRole('heading', { name: 'Approved' });
    expect(sent(spy, 'DecideByLink')[0].variables).toMatchObject({ game: 'Arkham Horror', details: ARKHAM });
  });

  it('answers a corrected name it cannot look up', async () => {
    api({
      open: ({ game }) =>
        game === 'X'
          ? gqlError('Nothing was looked up: the game must be 2–80 characters.', 'BAD_NAME', 400)
          : { emailedSuggestion: { suggestion: MISSPELT, preview: { outcome: 'NO_MATCH', details: null } } },
    });
    approve('&game=X');
    expect(await screen.findByRole('heading', { name: 'Name not recognised' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nothing was looked up: the game must be 2–80 characters. Go back and try again.',
    );
  });

  it("denies, showing what BoardGameGeek has so the owner sees what's turned down", async () => {
    const spy = api({
      suggestion: { ...MISSPELT, game: 'Arkham Horror' },
      decided: { decideSuggestion: { item: { game: 'Arkham Horror' }, lookup: null } },
    });
    deny();
    expect(await screen.findByRole('heading', { name: 'Deny Arkham Horror?' })).toBeInTheDocument();
    expect(screen.getByText('Investigate Arkham.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(sent(spy, 'EmailedSuggestion')[0].variables).toEqual({ id: 'sug-aaaaaa' });
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(await screen.findByRole('heading', { name: 'Denied' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent("Arkham Horror won't appear on the wishlist.");
    expect(sent(spy, 'DecideByLink')[0].variables).toEqual({ id: 'sug-aaaaaa', decision: 'DENY' });
  });

  it('reads and shows nothing to anyone signed out, offering sign-in that comes back to the page', async () => {
    const spy = api();
    visit('/approve?id=sug-aaaaaa', false);
    expect(await screen.findByText('Sign in as the owner to see this suggestion and decide it.')).toBeInTheDocument();
    expect(screen.queryByText(/Arkham/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith('/approve?id=sug-aaaaaa'));
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeInTheDocument();
    expect(operations(spy)).toEqual([]);
  });

  it("tells someone signed in with another account that it's the owner's to decide", async () => {
    vi.mocked(signedInEmail).mockResolvedValueOnce('friend@example.com');
    const spy = api();
    visit('/deny?id=sug-aaaaaa', false);
    expect(await screen.findByRole('status')).toHaveTextContent(
      "This is the owner's to decide. You're signed in as friend@example.com.",
    );
    expect(operations(spy)).toEqual([]);
  });

  it('tells a stale link the suggestion was already decided, offering nothing to press', async () => {
    api({ suggestion: { ...MISSPELT, status: 'APPROVED' } });
    approve();
    expect(await screen.findByRole('heading', { name: 'Already approved' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Arkham Horry was approved earlier. Nothing changed.');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('answers a bad, unknown or mismatched link with what is wrong', async () => {
    for (const [code, status, title] of [
      ['BAD_REQUEST', 400, 'Link not recognised'],
      ['NOT_FOUND', 404, 'Suggestion not found'],
      ['FORBIDDEN', 403, 'Link not valid'],
    ] as const) {
      api({ open: () => gqlError(`the ${code} message`, code, status) });
      approve();
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.getByText(`the ${code} message`)).toBeInTheDocument();
      document.body.innerHTML = '';
    }
  });

  it('says what stopped a decision: decided meanwhile, a name already listed, a bad name, or anything else', async () => {
    for (const [refusal, title, text] of [
      [
        gqlError('Arkham Horry was already denied', 'ALREADY_DECIDED', 409, { status: 'denied' }),
        'Already denied',
        'Arkham Horry was denied earlier. Nothing changed.',
      ],
      [
        gqlError('Arkham Horror is already on the list', 'CONFLICT', 409),
        'Already on the list',
        'Arkham Horror is already on the list. Nothing changed.',
      ],
      [
        gqlError('game must be 2–80 characters', 'BAD_REQUEST', 400),
        'Not approved',
        'Nothing changed: the game must be 2–80 characters. Open the link from the email again.',
      ],
      [gqlError('Server error', 'INTERNAL_SERVER_ERROR', 500), 'Something went wrong', 'Server error'],
    ] as const) {
      api({ decided: refusal });
      approve();
      fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(text);
      document.body.innerHTML = '';
    }
  });

  it('presses once: the button waits while the decision is out', async () => {
    let answer = () => {};
    const spy = stubGraphql({
      EmailedSuggestion: () => ({ emailedSuggestion: { suggestion: MISSPELT, preview: null } }),
      DecideByLink: () =>
        new Promise((resolve) => (answer = () => resolve({ decideSuggestion: { item: null, lookup: 'FOUND' } }))),
    });
    approve();
    const button = await screen.findByRole('button', { name: 'Approve' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    answer();
    expect(await screen.findByRole('heading', { name: 'Approved' })).toBeInTheDocument();
    expect(sent(spy, 'DecideByLink')).toHaveLength(1);
    // No preview (no lookup configured): no details, so the server looks it up.
    expect(sent(spy, 'DecideByLink')[0].variables).not.toHaveProperty('details');
  });
});
