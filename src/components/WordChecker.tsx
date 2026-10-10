import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { normalizeWord } from '../utils/wordList';
import { wiktionaryPage } from '../utils/wiktionary';
import type { Meaning } from '../utils/wiktionary';
import { loadWordList } from '../hooks/wordList';
import { lookUp } from '../hooks/dictionary';
import Notice from './Notice';

/**
 * The verdict comes from the word-game list (public/words/: ENABLE and the
 * newer words it lacks) at once, with no network wait. A word the list lacks
 * is `unlisted` while the dictionary (Wiktionary) is asked, and stays so if
 * it can't be reached: that says nothing against the word, so it is never a
 * red ✗. The dictionary turns it `valid` when it has a playable sense and
 * `invalid` only when it answers that it has none. `meanings` are the
 * dictionary's definitions: undefined while they load, null when it couldn't
 * give any. `unchecked` means neither the list nor the dictionary could be had.
 */
type Verdict =
  | { status: 'valid'; word: string; source: 'list' | 'dictionary'; meanings?: Meaning[] | null }
  | { status: 'unlisted'; word: string; dictionary: 'asking' | 'unreachable' }
  | { status: 'invalid'; word: string }
  | { status: 'unchecked'; word: string };

/**
 * A verdict on a word, or a note instead of one: `letters`, what was typed
 * isn't one word of letters; `short`, it's a lone letter, which no word game
 * here plays (Wiktionary would call "a" and "x" words).
 */
type Result = Verdict | { status: 'letters' } | { status: 'short' };

/** Bananagrams' shortest word, and ENABLE's. */
const MIN_LETTERS = 2;

// Wiktionary's text is CC BY-SA 4.0: credit, the source, the licence, and
// that it was shortened (only playable senses, two definitions each, plain text).
const LICENCE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/';

const STATUS_TEXT: Record<Verdict['status'], string> = {
  valid: 'Valid word',
  unlisted: 'Not in our word list',
  invalid: 'Not a valid word',
  unchecked: "Couldn't check right now",
};

const STATUS_ICON: Record<Verdict['status'], string> = { valid: '✓', unlisted: '?', invalid: '✗', unchecked: '?' };

export default function WordChecker() {
  const [input, setInput] = useState('');
  // Checking: waiting for the word list. Locked: waiting on the dictionary
  // with no list, the one wait that keeps the box (the list is in memory
  // after the first check, and locking the box would close a phone's keyboard).
  const [isChecking, setIsChecking] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Each check or retry takes the next number; only the latest one answers.
  const latest = useRef(0);

  // Start fetching the list on arrival, so the first check doesn't wait on it.
  useEffect(() => { void loadWordList(); }, []);

  /** Asks the dictionary about a word the list lacks, and settles its verdict. */
  async function askDictionary(word: string, request: number) {
    setResult({ status: 'unlisted', word, dictionary: 'asking' });
    const lookup = await lookUp(word);
    if (request !== latest.current) return;
    if (lookup?.found) setResult({ status: 'valid', word, source: 'dictionary', meanings: lookup.meanings });
    else if (lookup) setResult({ status: 'invalid', word });
    else setResult({ status: 'unlisted', word, dictionary: 'unreachable' });
  }

  async function check(word: string) {
    const request = ++latest.current;
    setIsChecking(true);
    setResult(null);

    const words = await loadWordList();
    if (request !== latest.current) return;
    setIsChecking(false);
    if (words?.has(word)) {
      // The verdict is in; the definitions follow when the dictionary answers.
      setResult({ status: 'valid', word, source: 'list' });
      const lookup = await lookUp(word);
      if (request !== latest.current) return;
      setResult({ status: 'valid', word, source: 'list', meanings: lookup?.found ? lookup.meanings : null });
      return;
    }
    if (words) {
      await askDictionary(word, request);
      return;
    }

    // No list (offline on a first visit, or it wouldn't load): the dictionary
    // is all there is, so wait for it.
    setIsChecking(true);
    setIsLocked(true);
    const lookup = await lookUp(word);
    setIsChecking(false);
    setIsLocked(false);
    if (request !== latest.current) return;
    if (lookup?.found) setResult({ status: 'valid', word, source: 'dictionary', meanings: lookup.meanings });
    else if (lookup) setResult({ status: 'invalid', word });
    else setResult({ status: 'unchecked', word });
  }

  /** Try again: the same question, with the box ready for the next word. */
  function retry(run: () => Promise<void>) {
    inputRef.current?.focus();
    void run();
  }

  function handleCheck(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const word = normalizeWord(input);
    if (!word || word.length < MIN_LETTERS) {
      // Supersedes a check still waiting on the list, which won't clear this.
      latest.current++;
      setIsChecking(false);
      setResult({ status: word ? 'short' : 'letters' });
      return;
    }
    void check(word);
  }

  return (
    <div className="rules-chat-panel word-checker-panel">
      <form className="rules-chat-input" onSubmit={handleCheck}>
        {/* iOS would otherwise capitalise and autocorrect the word being
            looked up, which is the one thing this tool must not do. */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a word..."
          disabled={isLocked}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <button type="submit" disabled={!input.trim() || isLocked}>
          Check
        </button>
      </form>
      {/* Announced as it changes: a verdict can follow the first answer. */}
      <div className="word-checker-body" aria-live="polite">
        {result?.status === 'letters' && (
          <Notice tone="info">Use one word of letters only, without spaces, hyphens or apostrophes.</Notice>
        )}
        {result?.status === 'short' && (
          <Notice tone="info">Words need at least two letters.</Notice>
        )}
        {result && result.status !== 'letters' && result.status !== 'short' && (
          <div className="word-result">
            <div className={`word-badge word-${result.status}`}>
              <span className="word-badge-icon" aria-hidden="true">{STATUS_ICON[result.status]}</span>
              <span className="word-badge-word">{result.word}</span>
              <span className="word-badge-status">{STATUS_TEXT[result.status]}</span>
            </div>
            {result.status === 'valid' && result.source === 'dictionary' && (
              <p className="word-note">Not in our word list, but the dictionary has it.</p>
            )}
            {result.status === 'unlisted' && result.dictionary === 'asking' && (
              <p className="word-note">Checking the dictionary…</p>
            )}
            {result.status === 'unlisted' && result.dictionary === 'unreachable' && (
              <Notice tone="warning" action={{ label: 'Try again', onClick: () => retry(() => askDictionary(result.word, ++latest.current)) }}>
                The dictionary couldn&apos;t be reached to double-check.
              </Notice>
            )}
            {result.status === 'unchecked' && (
              <Notice tone="warning" action={{ label: 'Try again', onClick: () => retry(() => check(result.word)) }}>
                Neither the word list nor the dictionary could be reached.
              </Notice>
            )}
            {result.status === 'valid' && result.meanings === undefined && (
              <p className="word-note">Looking up the meaning…</p>
            )}
            {result.status === 'valid' && result.meanings && (
              <div className="word-meanings">
                {result.meanings.map((meaning, j) => (
                  <div key={j} className="word-meaning">
                    <div className="word-pos">{meaning.partOfSpeech}</div>
                    {meaning.definitions.slice(0, 2).map((def, k) => (
                      <div key={k} className="word-def">
                        <span className="word-def-num">{k + 1}.</span> {def.definition}
                        {def.example && (
                          <div className="word-example">"{def.example}"</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                <p className="word-source">
                  Definitions from{' '}
                  <a href={wiktionaryPage(result.word)} target="_blank" rel="noopener noreferrer">Wiktionary</a>
                  {' '}(<a href={LICENCE_URL} target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>), shortened
                </p>
              </div>
            )}
          </div>
        )}
        {!result && !isChecking && (
          <div className="word-checker-empty">
            Type a word to check if it's valid for word games like Bananagrams.
          </div>
        )}
        {isChecking && (
          <div className="word-checker-empty">Checking...</div>
        )}
      </div>
    </div>
  );
}
