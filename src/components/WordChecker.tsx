import { useState } from 'react';
import type { FormEvent } from 'react';
import * as Sentry from '@sentry/react';

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
 * `invalid` only when the dictionary answered 404 (it has no such word);
 * `unchecked` when it couldn't be asked or answered something unexpected,
 * which says nothing about the word.
 */
type Result =
  | { status: 'valid'; word: string; entries: DictEntry[] }
  | { status: 'invalid'; word: string }
  | { status: 'unchecked'; word: string };

const STATUS_TEXT: Record<Result['status'], string> = {
  valid: 'Valid word',
  invalid: 'Not a valid word',
  unchecked: "Couldn't check right now",
};

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

  async function handleCheck(e: FormEvent) {
    e.preventDefault();
    const word = input.trim().toLowerCase();
    if (!word) return;

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );

      if (res.status === 404) {
        setResult({ status: 'invalid', word });
      } else if (!res.ok) {
        setResult({ status: 'unchecked', word });
      } else {
        const entries = parseEntries(await res.json());
        if (entries) {
          setResult({ status: 'valid', word, entries });
        } else {
          Sentry.captureMessage('word checker: unexpected dictionary response', { level: 'warning' });
          setResult({ status: 'unchecked', word });
        }
      }
    } catch {
      // Offline, or a body that isn't JSON: the word went unchecked.
      setResult({ status: 'unchecked', word });
    }

    setIsLoading(false);
  }

  return (
    <div className="rules-chat-panel">
      <div className="word-checker-body">
        {result && (
          <div className="word-result">
            <div className={`word-badge word-${result.status}`}>
              <span className="word-badge-word">{result.word}</span>
              <span className="word-badge-status">{STATUS_TEXT[result.status]}</span>
            </div>
            {result.status === 'valid' && result.entries.map((entry, i) => (
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
