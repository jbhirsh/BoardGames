import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuggestForm from '../components/SuggestForm';
import { gqlError, operations, stubGraphql } from './helpers/graphqlFetch';
import { alreadyListed } from '../utils/alreadyListed';
import { GAME_MAX, GAME_MIN, NAME_MAX, NOTE_MAX } from '../data/suggestionLimits';

const sent = { suggestGame: { id: 'sug-1' } };

function fill() {
  fireEvent.change(screen.getByLabelText('Game'), { target: { value: ' Root ' } });
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex' } });
  fireEvent.change(screen.getByLabelText(/Why\?/), { target: { value: 'Mean fun' } });
}

describe('SuggestForm', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('marks each placeholder as an example, not a typed value', () => {
    render(<SuggestForm />);
    for (const field of [
      screen.getByLabelText('Game'),
      screen.getByLabelText('Your name'),
      screen.getByLabelText(/Why\?/),
    ]) {
      expect(field.getAttribute('placeholder')).toMatch(/^e\.g\. \S/);
    }
  });

  it('gives an example game that is on neither the collection nor the wishlist', () => {
    render(<SuggestForm />);
    const example = screen
      .getByLabelText('Game')
      .getAttribute('placeholder')!
      .replace(/^e\.g\. /, '');
    expect(alreadyListed(example)).toBeNull();
  });

  it('bounds each field as the API does', () => {
    render(<SuggestForm />);
    expect(screen.getByLabelText('Game')).toHaveAttribute('minlength', String(GAME_MIN));
    expect(screen.getByLabelText('Game')).toHaveAttribute('maxlength', String(GAME_MAX));
    expect(screen.getByLabelText('Your name')).toHaveAttribute('maxlength', String(NAME_MAX));
    expect(screen.getByLabelText(/Why\?/)).toHaveAttribute('maxlength', String(NOTE_MAX));
  });

  it('prefills the name the browser remembers', () => {
    localStorage.setItem('gameroom:name', 'Jess');
    render(<SuggestForm />);
    expect(screen.getByLabelText('Your name')).toHaveValue('Jess');
  });

  it('posts the trimmed fields, remembers the name, and confirms', async () => {
    const fetchSpy = stubGraphql({ SuggestGame: () => sent });
    render(<SuggestForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent("Thanks! Root is waiting for Jess's approval."),
    );
    expect(operations(fetchSpy)).toMatchObject([
      { operationName: 'SuggestGame', variables: { game: 'Root', name: 'Alex', note: 'Mean fun' } },
    ]);
    expect(localStorage.getItem('gameroom:name')).toBe('Alex');
    expect(screen.getByLabelText('Game')).toHaveValue('');
  });

  it('refuses an invalid name before posting and shows the hint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<SuggestForm />);
    fill();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'a@b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/letters, numbers/));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses games already owned or already on the wishlist before posting', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<SuggestForm />);
    fill();
    fireEvent.change(screen.getByLabelText('Game'), { target: { value: 'codenames' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('We already own Codenames.'));
    fireEvent.change(screen.getByLabelText('Game'), { target: { value: 'SPLENDOR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Splendor is already on the wishlist.'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the server error message when the request is refused', async () => {
    stubGraphql({ SuggestGame: () => gqlError('Suggestions are not open yet', 'UNAVAILABLE', 503) });
    render(<SuggestForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Suggestions are not open yet'));
  });

  it('shows a generic error when the network fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    render(<SuggestForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Something went wrong'));
  });

  it('disables the button while sending', async () => {
    let resolve: (r: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );
    render(<SuggestForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    resolve(Response.json({ data: sent }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send suggestion' })).toBeEnabled());
  });
});
