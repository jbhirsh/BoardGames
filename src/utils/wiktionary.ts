/**
 * Reading Wiktionary's REST definition API
 * (https://en.wiktionary.org/api/rest_v1/page/definition/<word>) for the word
 * checker. The body is keyed by language code; only `en` is read, a list of
 * senses `{ partOfSpeech, language, definitions: [{ definition: <html> }] }`.
 *
 * Wiktionary lists far more than a word-game list does, so a word counts as
 * playable (an ordinary English word of letters, Bananagrams-style) only when
 * at least one sense passes all of these:
 *
 * - Its language is English. The `en` group also carries Translingual senses:
 *   ISO codes and symbols ("teh", "ran").
 * - Its part of speech isn't a proper noun, an abbreviation, initialism or
 *   acronym, a symbol, letter or contraction ("dont"), an affix (prefix,
 *   suffix, infix, interfix, circumfix), or a phrase: a title of letters
 *   alone filed as a phrase is one written without its dots ("etc").
 * - One of its definitions, as text, is none of:
 *   - empty (a heading over sub-senses);
 *   - a misspelling: "Misspelling of", "Common misspelling of", "Deliberate
 *     misspelling of" ("teh");
 *   - a short form filed under the part of speech of what it stands for:
 *     "Abbreviation of" ("govt"), "Initialism of", "Acronym of",
 *     "Contraction of" (a clipping such as "info" still counts);
 *   - a case variant: "Alternative letter-case form of" ("asap" of ASAP,
 *     "rsvp"), or an alternative form or spelling of the same letters
 *     capitalised ("tv" of TV), whose real entry is a name or an
 *     abbreviation.
 *
 * Everything else counts, including what a word list also takes: inflections
 * ("ran" is the past of run, "paris" the plural of pari), other alternative
 * forms and spellings ("qi" of chi), obsolete, archaic, dialect and
 * nonstandard senses, and interjections. Title lookups are case-sensitive, so
 * a lowercased name with no lowercase entry ("london") is a 404.
 *
 * Wiktionary also files lone letters as nouns or articles ("a", "x"); the
 * checker turns away anything under two letters before asking.
 */

/** One part of speech's definitions, as plain text, for the checker to show. */
export interface Meaning {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
}

/**
 * Wiktionary's answer about a word: playable with the meanings that make it
 * so (merged by part of speech, in Wiktionary's order), or not playable.
 */
export type Reading = { playable: true; meanings: Meaning[] } | { playable: false };

const EXCLUDED_POS = new Set([
  'proper noun',
  'abbreviation', 'initialism', 'acronym',
  'symbol', 'letter', 'contraction',
  'prefix', 'suffix', 'infix', 'interfix', 'circumfix',
  'phrase',
]);

const NOT_A_WORD = /^(?:\w+ )?(?:misspelling|abbreviation|initialism|acronym|contraction) of\b/i;
const LETTER_CASE = /^alternative letter-case form of\b/i;
const ALTERNATIVE = /^alternative (?:form|spelling) of (\S+)/i;

/** The page a word's definitions come from, for the attribution link. */
export function wiktionaryPage(word: string): string {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the HTML entities a definition can hold. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * A definition's HTML as one line of text: the sense itself without any
 * nested sub-sense list, its inline stylesheets dropped, tags stripped and
 * entities decoded.
 */
export function htmlToText(html: string): string {
  const own = html.split(/<(?:ol|ul|dl)\b/i)[0];
  return decodeEntities(stripTags(own)).replace(/\s+/g, ' ').trim();
}

/**
 * The text between tags, in one pass: each `<...>` is skipped whole, a
 * `<style>` block up to its closing tag, and an unclosed tag ends the text.
 * A scan rather than a regex replace, which a nested `<scr<script>ipt>`
 * could get past; the result is only ever rendered as text anyway.
 */
function stripTags(html: string): string {
  const lower = html.toLowerCase();
  let text = '';
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf('<', at);
    if (open === -1) return text + html.slice(at);
    text += html.slice(at, open);
    const from = lower.startsWith('<style', open) ? lower.indexOf('</style', open) : open;
    const close = from === -1 ? -1 : html.indexOf('>', from);
    if (close === -1) return text;
    at = close + 1;
  }
  return text;
}

/** Whether a definition, as text, makes the word playable. */
function isPlayableDefinition(text: string, word: string): boolean {
  if (!text || NOT_A_WORD.test(text) || LETTER_CASE.test(text)) return false;
  const target = ALTERNATIVE.exec(text)?.[1].replace(/[.,;:]+$/, '');
  return !(target && target !== word && target.toLowerCase() === word);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

interface Sense {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
}

function firstExample(v: Record<string, unknown>): string | undefined {
  const parsed = Array.isArray(v.parsedExamples) ? v.parsedExamples[0] : undefined;
  const html = isObject(parsed) && typeof parsed.example === 'string' ? parsed.example : undefined;
  const text = html === undefined ? '' : htmlToText(html);
  return text || undefined;
}

function parseSense(v: unknown): Sense | null {
  if (!isObject(v) || typeof v.partOfSpeech !== 'string' || !Array.isArray(v.definitions)) return null;
  const definitions = [];
  for (const d of v.definitions) {
    if (!isObject(d) || typeof d.definition !== 'string') return null;
    definitions.push({ definition: htmlToText(d.definition), example: firstExample(d) });
  }
  return { partOfSpeech: v.partOfSpeech, definitions };
}

/**
 * Whether a 404's body is the definition API saying it has no such page,
 * `{ status: 404, type: ... }`. A route Wikimedia has retired or moved
 * answers `{ httpCode: 404, httpReason: 'Not Found' }` instead, which says
 * nothing about the word.
 */
export function isMissingPage(data: unknown): boolean {
  return isObject(data) && data.status === 404;
}

/**
 * Reads a 200 body from the definition API for `word` (lowercase, as looked
 * up). Null when the body isn't shaped as expected, which says nothing about
 * the word. A body without English senses reads as not playable.
 */
export function readDefinitions(data: unknown, word: string): Reading | null {
  if (!isObject(data)) return null;
  if (data.en === undefined) return { playable: false };
  if (!Array.isArray(data.en)) return null;

  const byPos = new Map<string, Meaning['definitions']>();
  for (const raw of data.en) {
    // Another language's sense is skipped before it's read, so its shape
    // can't spoil the English ones. One with no language field sits under
    // `en`, so it is taken as English.
    if (isObject(raw) && typeof raw.language === 'string' && raw.language !== 'English') continue;
    const sense = parseSense(raw);
    if (!sense) return null;
    const pos = sense.partOfSpeech.toLowerCase();
    if (EXCLUDED_POS.has(pos)) continue;
    const kept = sense.definitions.filter((d) => isPlayableDefinition(d.definition, word));
    if (kept.length === 0) continue;
    byPos.set(pos, [...(byPos.get(pos) ?? []), ...kept]);
  }
  if (byPos.size === 0) return { playable: false };
  return {
    playable: true,
    meanings: [...byPos].map(([partOfSpeech, definitions]) => ({ partOfSpeech, definitions })),
  };
}
