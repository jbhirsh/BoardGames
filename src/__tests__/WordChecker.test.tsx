import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WordChecker from '../components/WordChecker';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderChecker() {
  return render(<WordChecker />);
}

describe('WordChecker', () => {
  it('renders the empty state message', () => {
    renderChecker();
    expect(screen.getByText(/Type a word to check/)).toBeInTheDocument();
  });

  it('renders input and disabled check button', () => {
    renderChecker();
    expect(screen.getByPlaceholderText('Enter a word...')).toBeInTheDocument();
    expect(screen.getByText('Check')).toBeDisabled();
  });

  it('enables check button when input has text', () => {
    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    expect(screen.getByText('Check')).not.toBeDisabled();
  });

  it('does not submit when input is empty whitespace', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: '   ' } });
    fireEvent.submit(screen.getByPlaceholderText('Enter a word...').closest('form')!);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows valid result with definitions for a valid word', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        word: 'hello',
        phonetic: '/həˈloʊ/',
        meanings: [{
          partOfSpeech: 'noun',
          definitions: [
            { definition: 'A greeting', example: 'She said hello' },
            { definition: 'An exclamation' },
          ],
        }],
      }],
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Valid word')).toBeInTheDocument();
    });

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('/həˈloʊ/')).toBeInTheDocument();
    expect(screen.getByText('noun')).toBeInTheDocument();
    expect(screen.getByText(/A greeting/)).toBeInTheDocument();
    expect(screen.getByText(/"She said hello"/)).toBeInTheDocument();
  });

  it('shows invalid result for an unknown word', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'xyzzy' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Not a valid word')).toBeInTheDocument();
    });
  });

  it('shows invalid result on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Not a valid word')).toBeInTheDocument();
    });
  });

  it('renders entry without phonetic when not provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        word: 'go',
        meanings: [{
          partOfSpeech: 'verb',
          definitions: [{ definition: 'To move' }],
        }],
      }],
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'go' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Valid word')).toBeInTheDocument();
    });

    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });
});
