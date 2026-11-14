import { describe, it, expect } from 'vitest';
import { ytURL, rulesURL, amazonURL } from '../utils/urls';

describe('ytURL', () => {
  it('returns a YouTube search URL with encoded query', () => {
    expect(ytURL('how to play catan')).toBe('https://www.youtube.com/results?search_query=how%20to%20play%20catan');
  });

  it('encodes special characters', () => {
    expect(ytURL('game & stuff')).toContain('game%20%26%20stuff');
  });
});

describe('rulesURL', () => {
  it('returns a Google search URL for rules PDF', () => {
    const url = rulesURL('Catan');
    expect(url).toBe('https://www.google.com/search?q=Catan%20board%20game%20rules%20PDF');
  });
});

describe('amazonURL', () => {
  it('is an encoded Amazon search for the game', () => {
    expect(amazonURL('7 Wonders Duel')).toBe('https://www.amazon.com/s?k=7%20Wonders%20Duel%20board%20game');
  });
});
