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

/** Wiktionary's answer for a page it doesn't have. */
const notFound = () => ({ ok: false, status: 404, json: async () => ({ status: 404, type: 'Internal error' }) }) as Response;

/** A Wiktionary definition-API body with one English sense. */
function wiktionary(partOfSpeech: string, ...definitions: string[]) {
  return { en: [{ partOfSpeech, language: 'English', definitions: definitions.map((definition) => ({ definition })) }] };
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
      json: async () => ({
        en: [{
          partOfSpeech: 'Noun',
          language: 'English',
          definitions: [
            {
              definition: 'A <a rel="mw:WikiLink" href="/wiki/greeting">greeting</a>',
              parsedExamples: [{ example: 'She said <b>hello</b>' }],
            },
            { definition: 'An exclamation' },
          ],
        }],
      }),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Valid word')).toBeInTheDocument();
    });

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('noun')).toBeInTheDocument();
    expect(screen.getByText(/A greeting/)).toBeInTheDocument();
    expect(screen.getByText(/"She said hello"/)).toBeInTheDocument();
    // Wiktionary's text is CC BY-SA 4.0: credit, source, licence, and the change.
    expect(screen.getByText(/^Definitions from/)).toHaveTextContent('Definitions from Wiktionary (CC BY-SA 4.0), shortened');
    expect(screen.getByRole('link', { name: 'Wiktionary' }))
      .toHaveAttribute('href', 'https://en.wiktionary.org/wiki/hello');
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('shows invalid result for an unknown word', async () => {
    // Wiktionary answers a page it doesn't have with a 404 of its own shape.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(notFound());

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'xyzzy' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Not a valid word')).toBeInTheDocument();
    });
  });

  it('calls a word invalid when Wiktionary has it, but only as something unplayable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => wiktionary('Article', 'Deliberate misspelling of <a href="/wiki/the">the</a>.'),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'teh' } });
    fireEvent.click(screen.getByText('Check'));

    expect(await screen.findByText('Not a valid word')).toBeInTheDocument();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("says the word could not be checked on a 404 that isn't Wiktionary saying it has no such page", async () => {
    // What a retired or moved route answers.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ httpCode: 404, httpReason: 'Not Found' }),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'xyzzy' } });
    fireEvent.click(screen.getByText('Check'));

    expect(await screen.findByText("Couldn't check right now")).toBeInTheDocument();
    expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
  });

  // Only a 404 Anything else says
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

  it('checks again from the start when nothing could be reached', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Check'));
    expect(await screen.findByText('Neither the word list nor the dictionary could be reached.')).toBeInTheDocument();

    // The list loads this time.
    vi.mocked(loadWordList).mockResolvedValue(new Set(['test']));
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
  });

  it('waits on the dictionary, box locked, when there is no list to answer from', async () => {
    let answer!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'test' } });
    fireEvent.click(screen.getByText('Check'));
    expect(await screen.findByText('Checking...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a word...')).toBeDisabled();
    await act(async () => { answer(notFound()); });
    expect(screen.getByText('Not a valid word')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a word...')).toBeEnabled();
  });

  it('puts the box above the answer', () => {
    renderChecker();
    const box = screen.getByPlaceholderText('Enter a word...');
    const empty = screen.getByText(/Type a word to check/);
    expect(box.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    // Whether it's reported is up to hooks/dictionary.ts (dictionary.test.ts).
    expect(Sentry.captureMessage).not.toHaveBeenCalledWith(
      'word checker: unexpected dictionary response',
      expect.anything(),
    );
  });

  it.each([
    ['senses that are not a list', { en: 'oops' }],
    ['a sense without a part of speech', { en: [{ language: 'English', definitions: [] }] }],
    ['definitions that are not a list', { en: [{ partOfSpeech: 'Noun', definitions: null }] }],
    ['a definition that is not text', { en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 42 }] }] }],
    ['a list instead of an object', []],
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
    // Reported once per page load, so dictionary.test.ts checks the report.
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
      json: async () => ({
        en: [{ partOfSpeech: 'Noun', language: 7, definitions: [{ definition: 'A greeting', parsedExamples: ['x'] }] }],
      }),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('Check'));

    await waitFor(() => {
      expect(screen.getByText('Valid word')).toBeInTheDocument();
    });
    expect(screen.getByText(/A greeting/)).toBeInTheDocument();
    expect(screen.queryByText(/"x"/)).not.toBeInTheDocument();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('shows only the senses that make a word playable, two definitions each', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        en: [
          { partOfSpeech: 'Proper noun', language: 'English', definitions: [{ definition: 'A city.' }] },
          { partOfSpeech: 'Verb', language: 'English', definitions: [{ definition: 'To move.' }, { definition: 'To leave.' }, { definition: 'To work.' }] },
        ],
      }),
    } as Response);

    renderChecker();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'go' } });
    fireEvent.click(screen.getByText('Check'));

    expect(await screen.findByText('Valid word')).toBeInTheDocument();
    expect(screen.getByText('verb')).toBeInTheDocument();
    expect(screen.getByText(/To leave\./)).toBeInTheDocument();
    expect(screen.queryByText(/To work\./)).not.toBeInTheDocument();
    expect(screen.queryByText('proper noun')).not.toBeInTheDocument();
    expect(screen.queryByText(/A city\./)).not.toBeInTheDocument();
  });
});

describe('WordChecker with the word-game list', () => {
  const ENTRY = wiktionary('Noun', 'A fruit.');
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
    expect(screen.getByText('Not in our word list, but the dictionary has it.')).toBeInTheDocument();
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://en.wiktionary.org/api/rest_v1/page/definition/qi');
  });

  it('calls a word neither has not valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(notFound());
    check('teh');
    expect(await screen.findByText('Not a valid word')).toBeInTheDocument();
    expect(screen.queryByText(/double-check/)).not.toBeInTheDocument();
  });

  it('shows no meaning for a listed word the dictionary has nothing playable for', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(wiktionary('Proper noun', 'A cat.')));
    check('cat');
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Looking up the meaning…')).not.toBeInTheDocument());
    expect(screen.queryByText(/A cat\./)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Wiktionary' })).not.toBeInTheDocument();
  });

  it('says at once that the list lacks a word, before the dictionary answers', async () => {
    let answer!: (r: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    check('teh');
    expect(await screen.findByText('Not in our word list')).toBeInTheDocument();
    expect(screen.getByText('Checking the dictionary…')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a word...')).toBeEnabled();
    await act(async () => { answer(notFound()); });
    expect(screen.getByText('Not a valid word')).toBeInTheDocument();
    expect(screen.queryByText('Checking the dictionary…')).not.toBeInTheDocument();
  });

  it('never calls an unlisted word invalid when the dictionary can\'t be reached, and can ask again', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    check('teh');
    expect(await screen.findByText(/couldn't be reached to double-check/)).toBeInTheDocument();
    expect(screen.getByText('Not in our word list')).toBeInTheDocument();
    expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('notice-warning');

    fetchSpy.mockResolvedValueOnce(ok(ENTRY));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
    expect(screen.getByText('Not in our word list, but the dictionary has it.')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("doesn't let an unlisted word's late verdict replace the next word's", async () => {
    const answers: ((r: Response) => void)[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { answers.push(resolve); }));
    check('teh');
    expect(await screen.findByText('teh')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'cat' } });
    fireEvent.click(screen.getByText('Check'));
    expect(await screen.findByText('cat')).toBeInTheDocument();
    await act(async () => { answers[0](notFound()); });
    expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
    expect(screen.getByText('Valid word')).toBeInTheDocument();
  });

  it('gives up on a dictionary that never answers', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      check('teh');
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(screen.getByText('Not in our word list')).toBeInTheDocument();
      expect(screen.getByText(/couldn't be reached to double-check/)).toBeInTheDocument();
      expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['a', 'X.', ' i '])('asks for two letters or more, without a verdict or a lookup, for %j', async (typed) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    check(typed);
    expect(await screen.findByText('Words need at least two letters.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('notice-info');
    expect(screen.queryByText('Valid word')).not.toBeInTheDocument();
    expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('takes a two-letter word', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok(ENTRY));
    check('qi');
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
    expect(screen.queryByText(/at least two letters/)).not.toBeInTheDocument();
  });

  it('asks for letters only, without a verdict or a lookup, for anything else', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    check("rock'n'roll");
    expect(await screen.findByText(/one word of letters only/)).toBeInTheDocument();
    expect(screen.queryByText('Not a valid word')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('takes a word with a phone\'s full stop after it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 522 } as Response);
    check('Cat.');
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
  });

  it('keeps the box usable while the list loads', async () => {
    let listReady!: (s: Set<string>) => void;
    vi.mocked(loadWordList).mockReturnValue(new Promise((resolve) => { listReady = resolve; }));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 522 } as Response);
    check('cat');
    expect(await screen.findByText('Checking...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter a word...')).toBeEnabled();
    await act(async () => { listReady(new Set(['cat'])); });
    expect(screen.getByText('Valid word')).toBeInTheDocument();
  });

  it('drops a pending check\'s "Checking..." when letters-only input supersedes it', async () => {
    vi.mocked(loadWordList).mockReturnValue(new Promise(() => {}));
    check('cat');
    expect(await screen.findByText('Checking...')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Enter a word...'), { target: { value: 'two words' } });
    fireEvent.click(screen.getByText('Check'));
    expect(await screen.findByText(/one word of letters only/)).toBeInTheDocument();
    expect(screen.queryByText('Checking...')).not.toBeInTheDocument();
  });

  it('answers a word checked twice from its latest lookup', async () => {
    const answers: ((r: Response) => void)[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => { answers.push(resolve); }));
    check('teh');
    expect(await screen.findByText('Checking the dictionary…')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Check'));
    await waitFor(() => expect(answers).toHaveLength(2));
    // The first lookup fails after the second was asked; the second answers.
    await act(async () => { answers[0]({ ok: false, status: 522 } as Response); });
    expect(screen.queryByText(/couldn't be reached/)).not.toBeInTheDocument();
    await act(async () => { answers[1](ok(ENTRY)); });
    expect(screen.getByText('Valid word')).toBeInTheDocument();
  });

  it('announces a verdict as it changes, and keeps the box focused on Try again', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok(ENTRY));
    check('teh');
    expect(await screen.findByText('Not in our word list')).toBeInTheDocument();
    expect(screen.getByText('teh').closest('[aria-live="polite"]')).not.toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(screen.getByPlaceholderText('Enter a word...')).toHaveFocus();
    expect(await screen.findByText('Valid word')).toBeInTheDocument();
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

