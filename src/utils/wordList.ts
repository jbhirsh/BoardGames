// Punctuation a phone adds around a word: a smart full stop after a double
// space, quotes, a comma. Inside a word it stays, and the word isn't one.
const WRAPPING = /^[.,!?;:'"“”‘’()]+|[.,!?;:'"“”‘’()]+$/g;

/**
 * The form a word is looked up in: trimmed, lowercased and unwrapped from
 * punctuation ("OK." is ok). Null when what's left isn't letters only, which
 * no word list or dictionary would hold.
 */
export function normalizeWord(input: string): string | null {
  const word = input.trim().toLowerCase().replace(WRAPPING, '');
  return /^[a-z]+$/.test(word) ? word : null;
}

/** The word list file (one word per line) as a set to look words up in. */
export function parseWordList(text: string): Set<string> {
  const words = new Set<string>();
  for (const line of text.split('\n')) {
    const word = line.trim();
    if (word) words.add(word);
  }
  return words;
}
