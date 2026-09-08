import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SuggestForm from '../components/SuggestForm';

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

function fill() {
  fireEvent.change(screen.getByLabelText('Game'), { target: { value: ' Root ' } });
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Alex' } });
  fireEvent.change(screen.getByLabelText(/Why\?/), { target: { value: 'Mean fun' } });
}

describe('SuggestForm', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('prefills the name the browser remembers', () => {
    localStorage.setItem('gameroom:name', 'Jess');
    render(<SuggestForm />);
    expect(screen.getByLabelText('Your name')).toHaveValue('Jess');
  });

  it('posts the trimmed fields, remembers the name, and confirms', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ item: { id: 'sug-1' } }));
    render(<SuggestForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent("Thanks! Root is waiting for Jess's approval."));
    expect(fetchSpy).toHaveBeenCalledWith('/api/suggestions', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ game: 'Root', name: 'Alex', note: 'Mean fun' }),
    }));
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
    fireEvent.change(screen.getByLabelText('Game'), { target: { value: 'DOMINION' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Dominion is already on the wishlist.'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the server error message when the request is refused', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: 'Suggestions are not open yet' }, false));
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
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((r) => { resolve = r; }));
    render(<SuggestForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    resolve(jsonResponse({}));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send suggestion' })).toBeEnabled());
  });
});
