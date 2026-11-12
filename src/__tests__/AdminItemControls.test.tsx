import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import AdminItemControls from '../components/AdminItemControls';
import { AuthContext } from '../context/authContextValue';
import { WishlistContext } from '../context/wishlistContextValue';
import type { WishlistItem } from '../data/types';
import { DESC_MAX, GAME_MAX, GAME_MIN, MINS_MAX, PLAYERS_MAX } from '../data/suggestionLimits';
import { gqlError, operations, stubGraphql } from './helpers/graphqlFetch';

const item: WishlistItem = {
  id: 'sug-1',
  name: 'Root',
  desc: 'Woodland war. “Mean fun”',
  blurb: 'Woodland war.',
  yt: '',
  players: '2–4',
  min: 2,
  max: 4,
  dur: '90 min',
  mins: 90,
  kw: ['strategy'],
  type: 'suggested',
  awards: [],
  suggestedBy: 'Alex',
  source: 'friend',
};

function renderControls(over: Partial<WishlistItem> = {}, admin = true) {
  const reload = vi.fn();
  const auth = { admin, loaded: true, refresh: vi.fn(async () => {}) };
  const { container } = render(
    <AuthContext.Provider value={auth}>
      <WishlistContext.Provider value={{ items: [], loaded: true, failed: false, reload }}>
        <AdminItemControls item={{ ...item, ...over }} />
      </WishlistContext.Provider>
    </AuthContext.Provider>,
  );
  return { reload, container };
}

/** The last operation sent: its name and variables. */
const lastSent = (spy: ReturnType<typeof stubGraphql>) => {
  const op = operations(spy).at(-1);
  return { op: op?.operationName, variables: op?.variables };
};

describe('AdminItemControls', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing when not signed in, and a pencil and a bin, named in full, for any entry', () => {
    expect(renderControls({}, false).container).toBeEmptyDOMElement();
    renderControls({ source: 'curated', name: 'SETI: Search for Extraterrestrial Intelligence' });
    for (const name of [
      'Edit SETI: Search for Extraterrestrial Intelligence',
      'Remove SETI: Search for Extraterrestrial Intelligence',
    ]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('title', name);
    }
  });

  it('opens an edit form prefilled from the entry and saves the changes', async () => {
    const spy = stubGraphql({ EditGame: () => ({ editGame: { id: 'sug-1' } }) });
    const { reload } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Root' }));
    const form = screen.getByRole('form', { name: 'Edit Root' });
    expect(within(form).getByLabelText('Name')).toHaveValue('Root');
    expect(within(form).getByLabelText('Section')).toHaveValue('');
    expect(within(form).getByLabelText('Minimum players')).toHaveValue(2);
    expect(within(form).getByLabelText('Maximum players')).toHaveValue(4);
    expect(within(form).getByLabelText('Minutes')).toHaveValue(90);
    expect(within(form).getByLabelText('Description')).toHaveValue('Woodland war.');
    expect(within(form).getByLabelText('Strategy')).toBeChecked();

    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Root: Riverfolk' } });
    fireEvent.change(within(form).getByLabelText('Section'), { target: { value: 'heavy' } });
    fireEvent.change(within(form).getByLabelText('Minutes'), { target: { value: '60' } });
    fireEvent.change(within(form).getByLabelText('Description'), { target: { value: ' Asymmetric. ' } });
    fireEvent.click(within(form).getByLabelText('Thematic'));
    fireEvent.click(within(form).getByLabelText('Strategy'));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(lastSent(spy)).toEqual({
      op: 'EditGame',
      variables: {
        id: 'sug-1',
        game: 'Root: Riverfolk',
        details: { min: 2, max: 4, mins: 60, desc: 'Asymmetric.', kw: ['thematic'], type: 'heavy' },
      },
    });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Root' })).toBeInTheDocument();
  });

  it('bounds each field of the edit form as the API does', () => {
    renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Root' }));
    const form = screen.getByRole('form', { name: 'Edit Root' });
    expect(within(form).getByLabelText('Name')).toHaveAttribute('minlength', String(GAME_MIN));
    expect(within(form).getByLabelText('Name')).toHaveAttribute('maxlength', String(GAME_MAX));
    expect(within(form).getByLabelText('Minimum players')).toHaveAttribute('max', String(PLAYERS_MAX));
    expect(within(form).getByLabelText('Maximum players')).toHaveAttribute('max', String(PLAYERS_MAX));
    expect(within(form).getByLabelText('Minutes')).toHaveAttribute('max', String(MINS_MAX));
    expect(within(form).getByLabelText('Description')).toHaveAttribute('maxlength', String(DESC_MAX));
  });

  it('keeps the form open and shows the reason when saving fails, and cancels cleanly', async () => {
    stubGraphql({ EditGame: () => gqlError('unknown wishlist type') });
    const { reload } = renderControls({ type: 'party', source: 'owner', suggestedBy: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Root' }));
    const form = screen.getByRole('form', { name: 'Edit Root' });
    expect(within(form).getByLabelText('Section')).toHaveValue('party');
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent('unknown wishlist type');
    expect(screen.getByRole('form', { name: 'Edit Root' })).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: 'Discarded' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    // Cancel discards: reopening starts from the entry again.
    fireEvent.click(screen.getByRole('button', { name: 'Edit Root' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Root');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks before removing, then removes it and reloads', async () => {
    const spy = stubGraphql({ RemoveGame: () => ({ removeGame: true }) });
    const { reload } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Root' }));
    const confirm = screen.getByRole('group', { name: 'Remove Root?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Root' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(lastSent(spy)).toEqual({ op: 'RemoveGame', variables: { id: 'sug-1' } });
  });

  it('reports a failed removal', async () => {
    stubGraphql({ RemoveGame: () => gqlError('owner sign-in required', 'FORBIDDEN', 403) });
    const { reload } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Root' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('owner sign-in required');
    expect(reload).not.toHaveBeenCalled();
  });
});
