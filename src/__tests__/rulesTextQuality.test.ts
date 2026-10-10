// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Quality guard for rules-text/*.txt, which is all the rules assistant reads
 * (#188). A bad rulebook PDF gets past every other check: the text exists and
 * has its page markers, and the assistant answers confidently from whatever
 * is in it. Two did, and their texts are kept in fixtures/rules-text/ to show
 * the guard still catches them:
 * - Dominion's base and Intrigue files were both pages of the same fan-made
 *   compendium of every expansion. The shared-text measure catches that.
 * - Cranium's was the scan's own OCR: lines of two columns run together, with
 *   letters split off their words. Words per page and stray letters catch it;
 *   most of its words are still real, so the dictionary measure doesn't.
 * The dictionary measure is for text with few real words at all, such as a
 * font whose letters extract as the wrong ones, or OCR of pictures.
 *
 * Paths resolve from process.cwd() (the repo root), as in gamesAssets.test.ts.
 */
const ROOT = process.cwd();
const RULES_TEXT_DIR = join(ROOT, 'rules-text');
const FIXTURES = join(ROOT, 'src', '__tests__', 'fixtures', 'rules-text');
const FILES = readdirSync(RULES_TEXT_DIR).filter((f) => f.endsWith('.txt')).sort();

// The word checker's lists: ENABLE plus the hand-picked newer words.
const DICTIONARY = new Set(
  ['enable.txt', 'additions.txt'].flatMap((f) => readFileSync(join(ROOT, 'public', 'words', f), 'utf8').split(/\r?\n/)),
);

/** Words compared in runs of this many, so shared text means shared sentences, not shared vocabulary. */
const SHINGLE = 5;
/**
 * At most this share of the smaller file's runs may also be in another file.
 * Ticket to Ride - Europe, which restates the base rules, is the closest real
 * pair at 34%; the two compendium extracts shared 67% (66% in the fixtures).
 */
const MAX_SHARED = 0.5;
/**
 * An image-only page extracts to nothing. Love Letter's small booklet is the
 * lowest real rulebook at 96 words a page; Cranium's OCR had 69.
 */
const MIN_WORDS_PER_PAGE = 80;
/**
 * Lone letters other than "a" and "I" are what OCR leaves when it splits a
 * word ("b a e t"). Cranium's OCR was 9.5% of them. The most in a file
 * kept here is 4.2%, Poetry for Neanderthals: OCR of an illustrated scan,
 * with some noise around readable rules.
 */
const MAX_STRAY_LETTERS = 0.06;
/**
 * The real rulebooks score 82% dictionary words and up, OCR'd scans
 * included; One Night Ultimate Vampire's OCR, 71%, is the one below.
 */
const MIN_DICTIONARY_RATIO = 0.75;

// Checked by hand; keep this list short. A file leaves it once it passes.
const FEW_WORDS_OK: Record<string, string> = {
  // The publisher's how-to-play web page printed to five pages, mostly
  // photos: 369 words, and every rule is there.
  'taco-vs-burrito.txt': 'a printed web page, mostly pictures',
};
const NOISE_OK: Record<string, string> = {
  // OCR of a scanned booklet with role art on every page: the rules prose is
  // readable but surrounded by fragments (0.71). A transcription, as Cranium
  // has, would fix it.
  'one-night-werewolf.vampire.txt': 'OCR of a heavily illustrated scan',
};

const PAGE_MARKER = /^\[Page \d+\]$/gm;

function body(text: string): string {
  return text.replace(PAGE_MARKER, '');
}

function pageCount(text: string): number {
  return text.match(PAGE_MARKER)?.length ?? 0;
}

function words(text: string): string[] {
  return body(text).split(/\s+/).filter((w) => /\p{L}/u.test(w));
}

// Words the list leaves out: one-letter words, and what "can't", "won't"
// and "shan't" leave once their n't is taken off.
const SHORT_WORDS = new Set(['a', 'i', 'ca', 'wo', 'sha']);

/** The share of words that are one letter other than "a" or "I", once the punctuation around them is trimmed. */
function strayLetters(text: string): number {
  const all = words(text);
  const stray = all.filter((w) => {
    const core = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return /^\p{L}$/u.test(core) && !/^[aAI]$/.test(core);
  });
  return stray.length / all.length;
}

/** The share of words whose every letter run is a dictionary word ("all-play" checks "all" and "play"). */
function dictionaryRatio(text: string): number {
  const all = words(text);
  const real = all.filter((w) => {
    const bare = w.toLowerCase().replace(/n['’]t\b/g, '').replace(/['’](s|re|ll|ve|d|m)\b/g, '');
    return (bare.match(/\p{L}+/gu) ?? []).every((r) => DICTIONARY.has(r) || SHORT_WORDS.has(r));
  });
  return real.length / all.length;
}

function shingles(text: string): Set<string> {
  const tokens = body(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= tokens.length; i++) out.add(tokens.slice(i, i + SHINGLE).join(' '));
  return out;
}

/** The share of the smaller set's shingles the other set also has: 1 when one file is inside the other. */
function shared(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size === 0) return 0;
  let both = 0;
  for (const s of small) if (large.has(s)) both++;
  return both / small.size;
}

const TEXT = new Map(FILES.map((f) => [f, readFileSync(join(RULES_TEXT_DIR, f), 'utf8')]));

/** The measures a text falls short on, apart from shared text, which takes two files. */
function failures(text: string): string[] {
  return [
    words(text).length / pageCount(text) < MIN_WORDS_PER_PAGE && 'words per page',
    strayLetters(text) > MAX_STRAY_LETTERS && 'stray letters',
    dictionaryRatio(text) < MIN_DICTIONARY_RATIO && 'dictionary words',
  ].filter((f): f is string => f !== false);
}

const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

describe('the guard on the texts it was written for', () => {
  it('fails Cranium\'s OCR', () => {
    expect(failures(fixture('cranium-ocr.txt'))).toEqual(['words per page', 'stray letters']);
  });

  it('fails the two compendium extracts as one text', () => {
    // Three pages of each: two of the core rules both carried, and the
    // first card-reference page, which differed.
    const share = shared(shingles(fixture('dominion-compendium.txt')), shingles(fixture('dominion-intrigue-compendium.txt')));
    expect(share).toBeGreaterThan(MAX_SHARED);
  });
});

describe('rules-text quality', () => {
  it.each(FILES)('%s has about a page of words per page', (file) => {
    const text = TEXT.get(file)!;
    const perPage = words(text).length / pageCount(text);
    if (file in FEW_WORDS_OK) {
      expect(perPage, `${file} now passes: take it off FEW_WORDS_OK`).toBeLessThan(MIN_WORDS_PER_PAGE);
    } else {
      expect(perPage, `${file}: ${perPage.toFixed(0)} words a page`).toBeGreaterThanOrEqual(MIN_WORDS_PER_PAGE);
    }
  });

  it.each(FILES)('%s is mostly real words', (file) => {
    const ratio = dictionaryRatio(TEXT.get(file)!);
    if (file in NOISE_OK) {
      expect(ratio, `${file} now passes: take it off NOISE_OK`).toBeLessThan(MIN_DICTIONARY_RATIO);
    } else {
      expect(ratio, `${file}: ${(ratio * 100).toFixed(1)}% dictionary words`).toBeGreaterThanOrEqual(MIN_DICTIONARY_RATIO);
    }
  });

  it.each(FILES)('%s has few stray letters', (file) => {
    const share = strayLetters(TEXT.get(file)!);
    expect(share, `${file}: ${(share * 100).toFixed(1)}% stray letters`).toBeLessThanOrEqual(MAX_STRAY_LETTERS);
  });

  it('allowlists only files that exist', () => {
    expect([...Object.keys(FEW_WORDS_OK), ...Object.keys(NOISE_OK)].filter((f) => !TEXT.has(f))).toEqual([]);
  });

  it('has no two files sharing most of their text', () => {
    const sets = FILES.map((f) => [f, shingles(TEXT.get(f)!)] as const);
    const alike: string[] = [];
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const share = shared(sets[i][1], sets[j][1]);
        if (share > MAX_SHARED) alike.push(`${sets[i][0]} and ${sets[j][0]} share ${(share * 100).toFixed(0)}%`);
      }
    }
    expect(alike).toEqual([]);
  });
});
