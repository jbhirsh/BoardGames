import { useState } from 'react';
import type { FormEvent } from 'react';

interface Definition {
  definition: string;
  example?: string;
}

interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
}

interface DictEntry {
  word: string;
  phonetic?: string;
  meanings: Meaning[];
}

interface Result {
  valid: boolean;
  word: string;
  entries?: DictEntry[];
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

      if (res.ok) {
        const data: DictEntry[] = await res.json();
        setResult({ valid: true, word, entries: data });
      } else {
        setResult({ valid: false, word });
      }
    } catch {
      setResult({ valid: false, word });
    }

    setIsLoading(false);
  }

  return (
    <div className="rules-chat-panel">
      <div className="word-checker-body">
        {result && (
          <div className="word-result">
            <div className={`word-badge ${result.valid ? 'word-valid' : 'word-invalid'}`}>
              <span className="word-badge-word">{result.word}</span>
              <span className="word-badge-status">
                {result.valid ? 'Valid word' : 'Not a valid word'}
              </span>
            </div>
            {result.valid && result.entries?.map((entry, i) => (
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
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a word..."
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Check
        </button>
      </form>
    </div>
  );
}
