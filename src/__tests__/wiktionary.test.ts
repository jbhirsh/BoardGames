import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToText, isMissingPage, readDefinitions, wiktionaryPage } from '../utils/wiktionary';

/**
 * fixtures/wiktionary/ holds real bodies from the definition API, saved on
 * 2026-10-10 (en.wiktionary.org/api/rest_v1/page/definition/<word>), named
 * by word. Paris-capitalised is the page "Paris" (named apart from paris for
 * case-insensitive file systems). To stay small, game and Paris-capitalised
 * keep only their English group, Paris-capitalised only its first three
 * senses and their first four definitions, and it and a lose their usage
 * examples. The rest are as served.
 */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(process.cwd(), 'src', '__tests__', 'fixtures', 'wiktionary', `${name}.json`), 'utf8'));
}

function read(name: string, word = name.toLowerCase()) {
  return readDefinitions(fixture(name), word);
}

function partsOfSpeech(name: string) {
  const reading = read(name);
  return reading?.playable ? reading.meanings.map((m) => m.partOfSpeech) : [];
}

function sense(partOfSpeech: string, definition: string, language = 'English') {
  return { partOfSpeech, language, definitions: [{ definition }] };
}

describe('readDefinitions on real Wiktionary answers', () => {
  it('takes an alternative form as playable (qi, of chi)', () => {
    expect(read('qi')).toEqual({
      playable: true,
      meanings: [{ partOfSpeech: 'noun', definitions: [expect.objectContaining({ definition: 'Alternative form of chi.' })] }],
    });
  });

  it('takes a new word, its definitions as plain text without their inline styles (doomscroll)', () => {
    const reading = read('doomscroll');
    expect(reading).toEqual({
      playable: true,
      meanings: [{
        partOfSpeech: 'verb',
        definitions: [
          { definition: 'To continually read Internet news about catastrophic events.', example: undefined },
          {
            definition: 'To excessively and unproductively consume Internet posts.',
            example: "It sucks that I can't even open my phone and check my emails without doomscrolling social media for an hour!",
          },
        ],
      }],
    });
  });

  it('turns away a deliberate misspelling, and a Translingual code (teh)', () => {
    expect(read('teh')).toEqual({ playable: false });
  });

  it('turns away a plain misspelling (thier)', () => {
    expect(read('thier')).toEqual({ playable: false });
  });

  it("turns away a lowercase form of an abbreviation's capitals (asap, of ASAP; rsvp)", () => {
    expect(read('asap')).toEqual({ playable: false });
    expect(read('rsvp')).toEqual({ playable: false });
  });

  it('turns away a contraction written without its apostrophe (dont)', () => {
    expect(read('dont')).toEqual({ playable: false });
  });

  it('turns away an abbreviation filed as a noun (govt)', () => {
    expect(read('govt')).toEqual({ playable: false });
  });

  it('turns away an abbreviation filed as a phrase (etc)', () => {
    expect(read('etc')).toEqual({ playable: false });
  });

  it("keeps a word's own senses beside its capitals' (lol: a particle, and a nonsense syllable)", () => {
    expect(partsOfSpeech('lol')).toEqual(['particle', 'interjection']);
    const reading = read('lol');
    expect(reading?.playable && reading.meanings[1].definitions.map((d) => d.definition))
      .toEqual(['Used in song as a nonsense syllable.']);
  });

  it('turns away an alternative form that is the same letters capitalised (tv, of TV)', () => {
    expect(read('tv')).toEqual({ playable: false });
  });

  it('turns away proper nouns, English or Translingual (Paris)', () => {
    expect(read('Paris-capitalised', 'paris')).toEqual({ playable: false });
  });

  it('takes an inflection of a common noun, whatever proper noun shares it (paris, plural of pari)', () => {
    expect(read('paris')).toEqual({
      playable: true,
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'plural of pari.', example: undefined }] }],
    });
  });

  it('takes a past tense and skips the Translingual symbol (ran)', () => {
    const reading = read('ran');
    expect(partsOfSpeech('ran')).toEqual(['verb', 'noun']);
    expect(reading?.playable && reading.meanings[0].definitions.map((d) => d.definition)).toEqual([
      'simple past of run',
      'simple past of rin',
      'past participle of run',
    ]);
  });

  it('takes a plural and a third-person form (games)', () => {
    const reading = read('games');
    expect(reading?.playable && reading.meanings.map((m) => [m.partOfSpeech, m.definitions[0].definition])).toEqual([
      ['noun', 'plural of game'],
      ['verb', 'third-person singular simple present indicative of game'],
    ]);
  });

  it('takes a standard regional spelling (colour)', () => {
    expect(partsOfSpeech('colour')).toEqual(['noun', 'adjective', 'verb']);
  });

  it('merges senses by part of speech and drops the empty headings over sub-senses (game)', () => {
    const reading = read('game');
    expect(partsOfSpeech('game')).toEqual(['noun', 'adjective', 'verb']);
    const noun = reading?.playable ? reading.meanings[0].definitions : [];
    expect(noun[0].definition).toBe('A playful or competitive activity.');
    expect(noun.every((d) => d.definition !== '')).toBe(true);
    // Its two adjective senses (willing; lame) read as one list.
    const adjective = reading?.playable ? reading.meanings[1].definitions.map((d) => d.definition) : [];
    expect(adjective[0]).toBe('Willing and able to participate.');
    expect(adjective.at(-1)).toBe('Injured, lame.');
  });

  // "a" is never looked up: the checker turns away a lone letter first
  // (WordChecker.test.tsx), since Wiktionary files them as words. Its page
  // shows the part-of-speech filter on one real body with many kinds.
  it('drops the letter, symbol and contraction senses and keeps the others (a)', () => {
    expect(partsOfSpeech('a')).toEqual([
      'noun', 'article', 'preposition', 'verb', 'pronoun', 'adverb', 'adjective', 'particle', 'interjection',
    ]);
  });
});

describe('readDefinitions rules', () => {
  it.each([
    'Proper noun', 'Abbreviation', 'Initialism', 'Acronym', 'Symbol', 'Letter',
    'Prefix', 'Suffix', 'Infix', 'Interfix', 'Circumfix', 'Contraction', 'Phrase',
  ])('turns away a word that is only a %s', (pos) => {
    expect(readDefinitions({ en: [sense(pos, 'Something.')] }, 'word')).toEqual({ playable: false });
  });

  it.each([
    'Misspelling of their.',
    'Common misspelling of a lot.',
    'Deliberate misspelling of the, for humorous effect.',
    'Abbreviation of government.',
    'Initialism of also known as.',
    'Acronym of you only live once.',
    'Contraction of going to.',
    'Alternative letter-case form of OK.',
    'Alternative form of TV.',
    'Alternative spelling of TV',
    'Alternative form of TV..',
    '',
    '<span class="usage-label-sense"></span> ',
  ])('turns away a sense defined only as %j', (definition) => {
    expect(readDefinitions({ en: [sense('Noun', definition)] }, 'tv')).toEqual({ playable: false });
  });

  it.each([
    'Alternative form of chi.',
    'Alternative spelling of gray',
    'Obsolete form of show.',
    'Archaic spelling of spoon.',
    'past participle of run',
    'Alternative form of a.m.',
    'A misspelling, deliberately.',
    'Clipping of information.',
    'Something often abbreviated to its initials.',
    'Not a misspelling of anything.',
    'Once an alternative letter-case form of TV.',
    'Sometimes an alternative form of TV.',
    'Alternative form of tv.',
  ])('takes a sense defined as %j', (definition) => {
    expect(readDefinitions({ en: [sense('Noun', definition)] }, 'tv')).toMatchObject({ playable: true });
  });

  it('needs only one playable definition in a sense', () => {
    const reading = readDefinitions({
      en: [{ partOfSpeech: 'Noun', language: 'English', definitions: [{ definition: 'Misspelling of the.' }, { definition: 'A real thing.' }] }],
    }, 'teh');
    expect(reading).toEqual({ playable: true, meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A real thing.', example: undefined }] }] });
  });

  it('reads only English senses, and takes a sense with no language as English', () => {
    expect(readDefinitions({ en: [sense('Noun', 'A code.', 'Translingual')] }, 'w')).toEqual({ playable: false });
    expect(readDefinitions({ fr: [sense('Noun', 'Un mot.', 'French')] }, 'w')).toEqual({ playable: false });
    expect(readDefinitions({ en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'A thing.' }] }] }, 'w'))
      .toMatchObject({ playable: true });
  });

  it('takes the first example that has text', () => {
    const reading = readDefinitions({
      en: [{ partOfSpeech: 'Verb', definitions: [
        { definition: 'To go.', parsedExamples: [{ example: '<b>Go</b> away.' }, { example: 'Second.' }] },
        { definition: 'To leave.', parsedExamples: [{ example: '<span></span>' }] },
        { definition: 'To run.', parsedExamples: [{ example: 7 }] },
        { definition: 'To walk.', parsedExamples: 'oops' },
      ] }],
    }, 'go');
    expect(reading?.playable && reading.meanings[0].definitions.map((d) => d.example)).toEqual([
      'Go away.', undefined, undefined, undefined,
    ]);
  });

  it.each([
    ['null', null],
    ['a list', []],
    ['text', 'Not found'],
    ['senses that are not a list', { en: {} }],
    ['a sense that is not an object', { en: ['Noun'] }],
    ['a sense without a part of speech', { en: [{ definitions: [] }] }],
    ['a sense without definitions', { en: [{ partOfSpeech: 'Noun' }] }],
    ['a definition that is not an object', { en: [{ partOfSpeech: 'Noun', definitions: ['A thing.'] }] }],
    ['a definition without text', { en: [{ partOfSpeech: 'Noun', definitions: [{ definition: null }] }] }],
  ])('reads %s as unusable', (_label, body) => {
    expect(readDefinitions(body, 'word')).toBeNull();
  });

  it("skips another language's sense before reading it, so a malformed one does no harm", () => {
    expect(readDefinitions({ en: [{ language: 'Translingual', definitions: 'oops' }, sense('Noun', 'A thing.')] }, 'word'))
      .toMatchObject({ playable: true });
    expect(readDefinitions({ en: [{ language: 'Translingual', definitions: 'oops' }] }, 'word')).toEqual({ playable: false });
  });

  it('reads a malformed sense as unusable even after a playable one', () => {
    expect(readDefinitions({ en: [sense('Noun', 'A thing.'), { partOfSpeech: 'Verb' }] }, 'word')).toBeNull();
  });

});

describe('isMissingPage', () => {
  // A lowercased name with no lowercase entry (london) got this same 404.
  it("knows the API's own 404 for a page it doesn't have", () => {
    expect(isMissingPage(fixture('asdfgh'))).toBe(true);
  });

  it("doesn't take a retired or unknown route's 404, or anything else, for one", () => {
    expect(isMissingPage({ httpCode: 404, httpReason: 'Not Found' })).toBe(false);
    expect(isMissingPage({ status: '404' })).toBe(false);
    expect(isMissingPage([404])).toBe(false);
    expect(isMissingPage(null)).toBe(false);
    expect(isMissingPage('Not Found')).toBe(false);
  });
});

describe('htmlToText', () => {
  it('drops tags that nest or never close, rather than leaving a tag behind', () => {
    expect(htmlToText('a<scr<script>ipt>b')).toBe('aipt>b');
    expect(htmlToText('An <b>apple')).toBe('An apple');
    expect(htmlToText('An apple <a href="/wiki/x"')).toBe('An apple');
    expect(htmlToText('Events.<STYLE>.x{}</STYLE> More.')).toBe('Events. More.');
    expect(htmlToText('Cut <style>.x{} never closed')).toBe('Cut');
    expect(htmlToText('No tags at all.')).toBe('No tags at all.');
  });

  it('strips tags and collapses whitespace', () => {
    expect(htmlToText(' <a href="/wiki/x">An</a>\n  <i>apple</i>. ')).toBe('An apple.');
  });

  it('drops inline stylesheets', () => {
    expect(htmlToText('Events. <style data-mw="x">.mw-parser-output .defdate{font-size:smaller}</style>')).toBe('Events.');
  });

  it('keeps the sense and leaves out its nested sub-senses', () => {
    expect(htmlToText('year, a unit of time.\n<ol><li>Julian year.</li></ol>')).toBe('year, a unit of time.');
    expect(htmlToText('A thing.<UL><li>Sub.</li></UL>')).toBe('A thing.');
    expect(htmlToText('A thing.<dl><dd>Quote.</dd></dl>')).toBe('A thing.');
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToText('Q&amp;A &lt;b&gt; &quot;x&quot; it&apos;s a&nbsp;b &#39;c&#39; &#x2013; &#X2014; &AMP;')).toBe(
      'Q&A <b> "x" it\'s a b \'c\' – — &',
    );
  });

  it('decodes an escaped ampersand once only', () => {
    expect(htmlToText('&amp;lt;')).toBe('&lt;');
  });

  it('leaves an unknown or impossible entity as it is', () => {
    expect(htmlToText('&bogus; &#1114112; &#x110000;')).toBe('&bogus; &#1114112; &#x110000;');
    expect(htmlToText('&#x10FFFF;')).toBe(String.fromCodePoint(0x10ffff));
  });
});

describe('wiktionaryPage', () => {
  it("links a word's entry", () => {
    expect(wiktionaryPage('qi')).toBe('https://en.wiktionary.org/wiki/qi');
    expect(wiktionaryPage('a b')).toBe('https://en.wiktionary.org/wiki/a%20b');
  });
});
