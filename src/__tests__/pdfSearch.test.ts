import { describe, it, expect } from 'vitest';
import { findMatches, pageText, piecesOf } from '../utils/pdfSearch';

describe('pageText', () => {
  it('joins the items, marks where each starts and breaks lines at their ends', () => {
    const page = pageText([{ str: 'Draw ', hasEOL: false }, { str: 'two cards', hasEOL: true }, { str: 'Then play' }]);
    expect(page.text).toBe('Draw two cards\nThen play');
    expect(page.starts).toEqual([0, 5, 15]);
  });
});

describe('findMatches', () => {
  it('finds every occurrence, ignoring case', () => {
    expect(findMatches('Outbreak! An outbreak.', 'outbreak')).toEqual([[0, 8], [13, 21]]);
  });

  it('lets a space in the query match any whitespace, or none', () => {
    expect(findMatches('Research\nstation and researchstation', 'research station')).toEqual([[0, 16], [21, 36]]);
  });

  it('treats the query as text, not a pattern', () => {
    expect(findMatches('a.b axb (c)', 'a.b')).toEqual([[0, 3]]);
    expect(findMatches('a.b axb (c)', '(c)')).toEqual([[8, 11]]);
  });

  it('finds nothing for a blank query', () => {
    expect(findMatches('anything', '   ')).toEqual([]);
  });
});

describe('piecesOf', () => {
  const runs = [{ str: 'Place the ' }, { str: 'outbreaks' }, { str: ' marker' }];
  const page = pageText(runs);

  it('maps a match inside one item to that item', () => {
    expect(piecesOf(page, runs, [10, 18])).toEqual([{ item: 1, from: 0, to: 8 }]);
  });

  it('splits a match across the items it spans', () => {
    expect(piecesOf(page, runs, [6, 22])).toEqual([
      { item: 0, from: 6, to: 10 },
      { item: 1, from: 0, to: 9 },
      { item: 2, from: 0, to: 3 },
    ]);
  });
});
