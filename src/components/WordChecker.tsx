import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import * as Sentry from '@sentry/react';
import { normalizeWord } from '../utils/wordList';
import { loadWordList } from '../hooks/wordList';

interface Definition {
  definition: string;
  example?: string;
}

interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
}

interface DictEntry {
  phonetic?: string;
  meanings: Meaning[];
}

/**
 * The verdict comes from the word-game list (public/words/enable.txt) when it
 * holds the word, and from the online dictionary for words it doesn't.
 * `entries` are the dictionary's definitions: undefined while they load, null
 * when it couldn't give any. `invalid` with `doubleChecked: false` means the
 * list lacks the word and the dictionary couldn't be asked. `unchecked` means
 * neither source answered, which says nothing about the word.
 */
type Result =
  | { status: 'valid'; word: string; source: 'list' | 'dictionary'; entries?: DictEntry[] | null }
  | { status: 'invalid'; word: string; doubleChecked: boolean }
  | { status: 'unchecked'; word: string };

const STATUS_TEXT: Record<Result['status'], string> = {
  valid: 'Valid word',
  invalid: 'Not a valid word',
  unchecked: "Couldn't check right now",
};

const STATUS_ICON: Record<Result['status'], string> = { valid: '✓', invalid: '✗', unchecked: '?' };

// The dictionary only adds definitions or a second opinion; never wait long on it.
const DICTIONARY_TIMEOUT_MS = 5000;

type Lookup = { found: true; entries: DictEntry[] } | { found: false } | null;

/**
 * Asks the dictionary about a word: found with its entries, not found (404),
 * or null when it couldn't answer, including a 200 whose body isn't usable.
 */
async function lookUp(word: string): Promise<Lookup> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DICTIONARY_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: controller.signal },
    );
    if (res.status === 404) return { found: false };
    if (!res.ok) return null;
    const entries = parseEntries(await res.json());
    if (entries) return { found: true, entries };
    Sentry.captureMessage('word checker: unexpected dictionary response', { level: 'warning' });
    return null;
  } catch {
    // Offline, timed out, or a body that isn't JSON.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const optionalText = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function parseDefinition(v: unknown): Definition | null {
  if (!isObject(v) || typeof v.definition !== 'string') return null;
  return { definition: v.definition, example: optionalText(v.example) };
}

function parseMeaning(v: unknown): Meaning | null {
  if (!isObject(v) || typeof v.partOfSpeech !== 'string' || !Array.isArray(v.definitions)) return null;
  const definitions = v.definitions.map(parseDefinition);
  if (definitions.some((d) => d === null)) return null;
  return { partOfSpeech: v.partOfSpeech, definitions: definitions as Definition[] };
}

function parseEntry(v: unknown): DictEntry | null {
  if (!isObject(v) || !Array.isArray(v.meanings)) return null;
  const meanings = v.meanings.map(parseMeaning);
  if (meanings.some((m) => m === null)) return null;
  return { phonetic: optionalText(v.phonetic), meanings: meanings as Meaning[] };
}

/**
 * The dictionary's answer for a word it knows, or null when the body isn't
 * the non-empty list of entries the renderer needs. Only the fields shown are
 * checked; an optional one of the wrong type is dropped.
 */
function parseEntries(data: unknown): DictEntry[] | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const entries = data.map(parseEntry);
  return entries.some((e) => e === null) ? null : (entries as DictEntry[]);
}

export default function WordChecker() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Start fetching the list on arrival, so the first check doesn't wait on it.
  useEffect(() => { void loadWordList(); }, []);

  async function handleCheck(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const word = normalizeWord(input);
    if (!word) {
      setResult({ status: 'invalid', word: input.trim().toLowerCase(), doubleChecked: true });
      return;
    }

    setIsLoading(true);
    setResult(null);

    const words = await loadWordList();
    if (words?.has(word)) {
      // The verdict is in; the definitions follow when the dictionary answers.
      setResult({ status: 'valid', word, source: 'list' });
      setIsLoading(false);
      const lookup = await lookUp(word);
      const entries = lookup?.found ? lookup.entries : null;
      setResult((r) => (r?.status === 'valid' && r.word === word ? { ...r, entries } : r));
      return;
    }

    const lookup = await lookUp(word);
    if (lookup?.found) setResult({ status: 'valid', word, source: 'dictionary', entries: lookup.entries });
    else if (lookup) setResult({ status: 'invalid', word, doubleChecked: true });
    else if (words) setResult({ status: 'invalid', word, doubleChecked: false });
    else setResult({ status: 'unchecked', word });
    setIsLoading(false);
  }

  return (
    <div className="rules-chat-panel">
      <div className="word-checker-body">
        {result && (
          <div className="word-result">
            <div className={`word-badge word-${result.status}`}>
              <span className="word-badge-icon" aria-hidden="true">{STATUS_ICON[result.status]}</span>
              <span className="word-badge-word">{result.word}</span>
              <span className="word-badge-status">{STATUS_TEXT[result.status]}</span>
            </div>
            {result.status === 'valid' && result.source === 'dictionary' && (
              <p className="word-note">Not in the word-game list, but the dictionary has it.</p>
            )}
            {result.status === 'invalid' && !result.doubleChecked && (
              <p className="word-note">Not in the word-game list. The dictionary couldn't be reached to double-check.</p>
            )}
            {result.status === 'valid' && result.entries === undefined && (
              <p className="word-note">Looking up the meaning…</p>
            )}
            {result.status === 'valid' && result.entries?.map((entry, i) => (
              <div key={i} className="word-meanings">
                {entry.phonetic && (
                  <div className="word-phonetic">{entry.phonetic}</div>
                )}
                {entry.meanings.map((meaning, j) => (
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
              </div>
            ))}
          </div>
        )}
        {!result && !isLoading && (
          <div className="word-checker-empty">
            Type a word to check if it's valid for word games like Bananagrams.
          </div>
        )}
        {isLoading && (
          <div className="word-checker-empty">Checking...</div>
        )}
      </div>
      <form className="rules-chat-input" onSubmit={handleCheck}>
        {/* iOS would otherwise capitalise and autocorrect the word being
            looked up, which is the one thing this tool must not do. */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a word..."
          disabled={isLoading}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Check
        </button>
      </form>
    </div>
  );
}
