// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { citingClause, findCited, lineBreaks, passageStart, stem, words, type StyledRun } from '../utils/citeMatch';
import { pageText } from '../utils/pdfSearch';

/** A page of a rulebook's extracted text (rules-text/), as the reader's text layer reads it. */
function page(file: string, n: number): string {
  const text = readFileSync(join(process.cwd(), 'rules-text', `${file}.txt`), 'utf8');
  const start = text.indexOf(`[Page ${n}]`);
  const end = text.indexOf(`[Page ${n + 1}]`);
  return text.slice(start + `[Page ${n}]`.length, end < 0 ? undefined : end);
}

/** The words a match covers, on one line. */
function cited(text: string, clause: string): string | null {
  const m = findCited(text, clause);
  return m && text.slice(m[0], m[1]).replace(/\s+/g, ' ');
}

describe('stem', () => {
  it.each([
    ['moves', 'mov'], ['moved', 'mov'], ['moving', 'mov'], ['move', 'mov'],
    ['cities', 'city'], ['city', 'city'], ['rolled', 'roll'], ['rolls', 'roll'],
    ['cards', 'card'],
    // An -er comes off too, and a consonant doubled before an ending is undoubled.
    ['winner', 'win'], ['winning', 'win'], ['win', 'win'], ['robber', 'rob'], ['robbed', 'rob'],
    ['player', 'play'], ['players', 'play'], ['stopped', 'stop'],
    // Not a double l, s, f or z, which words end in anyway.
    ['rolling', 'roll'], ['passes', 'pass'],
    // Too short to lose an ending, or a double s that is no plural.
    ['need', 'need'], ['ring', 'ring'], ['uses', 'use'], ['pass', 'pass'], ['bus', 'bus'], ['the', 'the'], ['over', 'over'],
  ])('%s → %s', (word, expected) => {
    expect(stem(word)).toBe(expected);
  });
});

describe('words', () => {
  it('lowercases and stems each word, keeping where it is in the text', () => {
    const text = 'Can’t de-\nvelop, “7” Cards';
    expect(words(text).map((w) => [w.plain, w.stem, text.slice(w.start, w.end)])).toEqual([
      ['cant', 'cant', 'Can’t'],
      ['develop', 'develop', 'de-\nvelop'],
      ['7', '7', '7'],
      ['cards', 'card', 'Cards'],
    ]);
  });

  it('reads number words up to twelve as digits', () => {
    expect(words('one Five twelve thirteen').map((w) => w.stem)).toEqual(['1', '5', '12', 'thirteen']);
  });
});

describe('citingClause', () => {
  it.each([
    ['the sentence before the citation', 'Roll two dice. A 7 still moves the robber (', 'A 7 still moves the robber'],
    ['from the citation before it', 'Knights stop the barbarians (Cities And Knights p. 4), and a 7 moves the robber (', 'and a 7 moves the robber'],
    ['past a page named before it in its group', 'A 7 moves the robber (Base game p. 5, ', 'A 7 moves the robber'],
    ['keeping a parenthesis that is no citation', 'Move the robber (the grey piece) to a hex (', 'Move the robber (the grey piece) to a hex'],
    ['from a line break', 'Setup:\nPlace the robber on the desert (', 'Place the robber on the desert'],
    ['after a quoted sentence end', 'It says “stop.” Then discard half (', 'Then discard half'],
    ['the whole text when nothing bounds it', 'Discard half your cards ', 'Discard half your cards'],
  ])('%s', (_, before, expected) => {
    expect(citingClause(before)).toBe(expected);
  });
});

describe('findCited', () => {
  const catan5 = page('catan', 5);
  const ttr3 = page('ticket-to-ride', 3);

  it.each([
    // Catan p. 5. Each passage is widened to whole sentences.
    ['discarding half on a 7', catan5, 'If you roll a 7, nobody gets resources and anyone holding more than 7 cards returns half of them', /^If you roll a “7,” no one receives any resources\. Instead, .* return them to the bank\.$/],
    ['what a city costs', catan5, 'A city costs 3 ore and 2 grain and is worth 2 victory points', /c\) City Y Requires: 3 Ore & 2 Grain/],
    // The win, not the victory point cards' "10 victory points—that is, to
    // win": the same words, in the answer's order.
    ['the win', catan5, 'You win when you have 10 or more victory points during your turn', /^If you have 10 or more victory points during your turn, the game ends and you are the winner!$/],
    // "one" is the rulebook's "1"; the bracket the sentence opens with is kept.
    ['stealing a card', catan5, 'Then you steal one random resource card from a player with a settlement next to the robber', /^\(2\) Then you steal 1 \(random\) resource card/],
    // Ticket to Ride p. 3.
    ['claiming a route', ttr3, 'To claim a route you play as many cards of one colour as it has spaces', /^To claim a route, a player must play a set of cards equal to the number of spaces in the route\.$/],
    // Not "three of the five face-up cards are Locomotives", which shares
    // as many words but the generic "turn" where this has "draw".
    ['a face-up Locomotive', ttr3, 'If you take a face-up Locomotive, that is the only card you can draw that turn', /^If a Locomotive card is one of the five face-up cards, the player who draws it may only draw one card, instead of two\.$/],
  ])('finds %s', (_, text, clause, passage) => {
    expect(cited(text, clause)).toMatch(passage);
  });

  it.each([
    // A loose paraphrase: one or two of its words are on the page, not enough.
    ['a paraphrase of a rule on the page', catan5, 'Roll again whenever you throw doubles'],
    ['a trade, which page 5 never mentions', catan5, 'Players may trade resources with each other during their turn'],
    // Words every rulebook uses, with at most one more.
    ['words every rulebook uses', catan5, 'Each player takes a card from the deck on their turn'],
    ['a hand limit Ticket to Ride hasn\'t got', ttr3, 'Each player can hold as many cards as they like'],
    // Three words, only across a sentence end: the knight's "move the
    // robber. See “Rolling a ‘7’…".
    ['three words over two sentences', catan5, 'A 7 still moves the robber, as in the base game'],
    // The right words, the wrong page: the robber is not on Ticket to Ride's p. 3.
    ['a mismatched page', ttr3, 'A 7 still moves the robber, as in the base game'],
    // Too few words to tell one rule from another.
    ['a clause of two meaningful words', catan5, 'Move the robber'],
    ['an empty clause', catan5, ''],
  ])('finds nothing for %s', (_, text, clause) => {
    expect(findCited(text, clause)).toBeNull();
  });

  it('needs half the clause\'s words, not only three', () => {
    const text = 'Wizards duel. The wizard rolls the dragon die.';
    expect(findCited(text, 'The wizard rolls a dragon die on a tall golden fiery mountain peak')).toBeNull();
    expect(cited(text, 'The wizard rolls a dragon die on a mountain')).toBe('The wizard rolls the dragon die.');
  });

  it('needs two words that are more than any rulebook\'s', () => {
    const text = 'Each player draws a card on their turn, then fights the dragon.';
    expect(findCited(text, 'the player draws a card each turn')).toBeNull();
    expect(findCited(text, 'the player draws a card, then the dragon')).toBeNull();
    expect(cited(text, 'the player draws a card and fights the dragon')).toBe(text);
  });

  it('lets four words cross a sentence end, but prefers a passage that doesn\'t', () => {
    expect(cited('Move the robber. Roll a 7 now.', 'roll a 7 now and move the robber')).toBe('Move the robber. Roll a 7 now.');
    expect(findCited('Move the robber. Roll a 7.', 'a 7 and move the robber')).toBeNull();
  });

  it('prefers rarer shared words to common ones, as many of them', () => {
    // Three shared words each way; the hex is everywhere, the orc and elf
    // three times, the robber and stealing once.
    const filler = Array.from({ length: 14 }, () => 'x').join(' ');
    const text = `orc elf hex orc elf hex orc elf hex ${filler} robber steal hex`;
    expect(cited(text, 'the robber steals from an orc elf hex')).toBe('robber steal hex');
  });

  it('picks the shortest of passages that share as much', () => {
    const text = 'robber one two three four five six seven eight nine ten robber steal dragon';
    expect(cited(text, 'the robber steals a dragon')).toBe('robber steal dragon');
  });

  it('keeps to about the clause\'s length', () => {
    const filler = Array.from({ length: 20 }, () => 'and').join(' ');
    expect(findCited(`robber ${filler} steal ${filler} dragon`, 'the robber steals a dragon')).toBeNull();
  });

  it('widens only to sentence ends that are near', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
    // Eight words back and fourteen ahead are near enough; nine and fifteen aren't.
    expect(cited(`Start ${words(7)} robber steals dragon ${words(13)} end.`, 'the robber steals a dragon')).toMatch(/^Start .* end\.$/);
    expect(cited(`Start ${words(8)} robber steals dragon ${words(14)} end.`, 'the robber steals a dragon')).toBe('robber steals dragon');
  });

  it('starts a passage at a line that starts with a capital, not one that doesn\'t', () => {
    expect(cited('Robbers\nThe robber steals a dragon.', 'the robber steals a dragon')).toBe('The robber steals a dragon.');
    expect(cited('so that\nthe robber steals a dragon.', 'the robber steals a dragon')).toBe('so that the robber steals a dragon.');
  });

  describe('a heading\'s lettering', () => {
    const run = (str: string, fontName: string, size: number, hasEOL = true): StyledRun => ({ str, hasEOL, fontName, transform: [size, 0, 0, size, 0, 0] });
    // As on Catan's p. 5: a body sentence, a heading, a body sentence.
    const runs = [
      run('Each settlement is worth 1 victory point.', 'body', 11.5),
      run('c) City Requires: 3 Ore & 2 Grain', 'head', 11.5),
      run('You may only establish a city by', 'body', 11.5),
      run('upgrading one of your settlements.', 'body', 11.5),
    ];
    const { text, starts } = pageText(runs);

    it('marks where a line changes font or size', () => {
      expect(lineBreaks(runs, starts)).toEqual([starts[1], starts[2]]);
      const sized = [run('Claiming Routes', 'f', 16), run('', 'f', 10), run('To claim a route', 'f', 10)];
      expect(lineBreaks(sized, pageText(sized).starts)).toEqual([pageText(sized).starts[2]]);
      // Not within a line: an italic word, as Ticket to Ride sets one.
      const inline = [run('If a Locomotive card is ', 'body', 10, false), run('one of the five', 'italic', 10)];
      expect(lineBreaks(inline, pageText(inline).starts)).toEqual([]);
    });

    it('is never crossed in widening a passage', () => {
      const clause = 'A city takes 3 ore and 2 grain';
      expect(cited(text, clause)).toContain('settlements.');
      const m = findCited(text, clause, lineBreaks(runs, starts))!;
      expect(text.slice(...m)).toBe('c) City Requires: 3 Ore & 2 Grain');
    });

    it('counts as a sentence end in choosing a passage', () => {
      const split = [run('Score one victory point', 'body', 10), run('City', 'head', 14)];
      const at = pageText(split);
      const clause = 'a victory point for each city';
      expect(findCited(at.text, clause)).not.toBeNull();
      expect(findCited(at.text, clause, lineBreaks(split, at.starts))).toBeNull();
    });
  });
});

describe('passageStart', () => {
  it('gives the first six words, marked as cut', () => {
    expect(passageStart(' If you roll a “7,” no one\nreceives any resources ')).toBe('If you roll a “7,” no…');
  });

  it('gives a short passage whole', () => {
    expect(passageStart('Each city is worth 2')).toBe('Each city is worth 2');
  });
});
