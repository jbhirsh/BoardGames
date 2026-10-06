import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as Sentry from '@sentry/react';
import WordChecker from '../components/WordChecker';
import { loadWordList } from '../hooks/wordList';

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
}));

// Without a word list (null: it couldn't load) the checker asks only the
// dictionary, which is what the tests in the first block exercise.
vi.mock('../hooks/wordList', () => ({ loadWordList: vi.fn(async () => null) }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(Sentry.captureMessage).mockClear();
  vi.mocked(loadWordList).mockResolvedValue(null);
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

  it('opts the input out of iOS autocapitalise and autocorrect', () => {
    renderChecker();
    const input = screen.getByPlaceholderText('Enter a word...');
    // A dictionary lookup must receive exactly what was typed; iOS would
    // otherwise capitalise the first letter and autocorrect the word.
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('enterkeyhint', 'search');
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
    // dictionaryapi.dev answers an unknown word with a 404.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'xyzzy' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Not a valid word')).toBeInTheDocument();
    });
  });

  // Only a 404 means the dictionary has no such word. Anything else says
  // nothing about the word, so calling it invalid would be wrong information.
  it('says the word could not be checked on a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText("Couldn't check right now")).toBeInTheDocument();
    });
    expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
  });

  it.each([429, 500, 503])('says the word could not be checked on HTTP %i', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({ title: 'Something went wrong' }),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText("Couldn't check right now")).toBeInTheDocument();
    });
    expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
    expect(screen.queryByText('Valid word')).not.toBeInTheDocument();
    // A busy or failing service is not a surprise worth an alert.
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['meanings that are not a list', [{ word: 'hello', meanings: 'oops' }]],
    ['definitions that are not a list', [{ word: 'hello', meanings: [{ partOfSpeech: 'noun', definitions: null }] }]],
    ['a definition that is not text', [{ word: 'hello', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 42 }] }] }]],
    ['an object instead of a list', { title: 'No Definitions Found' }],
    ['an empty list', []],
    ['null', null],
  ])('says the word could not be checked when a 200 body has %s', async (_label, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText("Couldn't check right now")).toBeInTheDocument();
    });
    expect(screen.queryByText('Valid word')).not.toBeInTheDocument();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'word checker: unexpected dictionary response',
      expect.objectContaining({ level: 'warning' }),
    );
  });

  it('says the word could not be checked when a 200 body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    } as unknown as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText("Couldn't check right now")).toBeInTheDocument();
    });
  });

  it('ignores optional fields of the wrong type and keeps the rest', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [{
        word: 'hello',
        phonetic: 7,
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A greeting', example: ['x'] }] }],
      }],
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Valid word')).toBeInTheDocument();
    });
    expect(screen.getByText(/A greeting/)).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
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

describe('WordChecker with the word-game list', () => {
  const ENTRY = [{ meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A fruit.' }] }] }];
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

  function check(word: string) {
    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: word } });
    fireEvent.click(screen.getByText('Check'));
  }

  beforeEach(() => {
    vi.mocked(loadWordList).mockResolvedValue(new Set(['banana', 'cat']));
  });

  it('says a listed word is valid before the dictionary answers, then shows its meaning', async () => {
    let answer!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    check('Banana');

    expect(await screen.findByText('Valid word')).toBeInTheDocument();
    expect(screen.getByText('Looking up the meaning…')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a word...')).toBeEnabled();

    answer(ok(ENTRY));
    expect(await screen.findByText(/A fruit\./)).toBeInTheDocument();
    expect(screen.queryByText('Looking up the meaning…')).not.toBeInTheDocument();
  });

  it('keeps a listed word valid when the dictionary is down, just without a meaning', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 522 } as Response);
    check('cat');
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Looking up the meaning…')).not.toBeInTheDocument());
    expect(screen.queryByText(/word-game list/)).not.toBeInTheDocument();
  });

  it('asks the dictionary about a word the list lacks, and says so when it has it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(ENTRY));
    check('qi');
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
    expect(screen.getByText('Not in the word-game list, but the dictionary has it.')).toBeInTheDocument();
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/entries\/en\/qi$/);
  });

  it('calls a word neither has not valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    check('teh');
    expect(await screen.findByText('Not a valid word')).toBeInTheDocument();
    expect(screen.queryByText(/double-check/)).not.toBeInTheDocument();
  });

  it('calls an unlisted word not valid, noting the dictionary could not double-check', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    check('teh');
    expect(await screen.findByText('Not a valid word')).toBeInTheDocument();
    expect(screen.getByText(/couldn't be reached to double-check/)).toBeInTheDocument();
  });

  it('gives up on a dictionary that never answers', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      check('teh');
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(screen.getByText('Not a valid word')).toBeInTheDocument();
      expect(screen.getByText(/couldn't be reached to double-check/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns away anything but letters without looking it up', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    check("rock'n'roll");
    expect(await screen.findByText('Not a valid word')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('starts loading the list as soon as it appears', () => {
    vi.mocked(loadWordList).mockClear();
    renderChecker();
    expect(loadWordList).toHaveBeenCalledTimes(1);
  });

  it("doesn't give a word another word's late-arriving meaning", async () => {
    const answers: ((r: Response) => void)[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { answers.push(resolve); }));
    check('banana');
    expect(await screen.findByText('banana')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByText('Check'));
    expect(await screen.findByText('cat')).toBeInTheDocument();

    // banana's lookup answers after cat's check began; cat keeps waiting for its own.
    await act(async () => { answers[0](ok(ENTRY)); });
    expect(screen.queryByText(/A fruit\./)).not.toBeInTheDocument();
    expect(screen.getByText('Looking up the meaning…')).toBeInTheDocument();
  });
});

