import { describe, it, expect } from 'vitest';
import { ytURL, rulesURL, slugify, amazonURL, priceTrackerURL } from '../utils/urls';

describe('ytURL', () => {
  it('returns a YouTube search URL with encoded query', () => {
    expect(ytURL('how to play catan')).toBe(
      'https://www.youtube.com/results?search_query=how%20to%20play%20catan',
    );
  });

  it('encodes special characters', () => {
    expect(ytURL('game & stuff')).toContain('game%20%26%20stuff');
  });
});

describe('rulesURL', () => {
  it('returns a Google search URL for rules PDF', () => {
    const url = rulesURL('Catan');
    expect(url).toBe(
      'https://www.google.com/search?q=Catan%20board%20game%20rules%20PDF',
    );
  });
});

describe('slugify', () => {
  it('lowercases and replaces non-alphanumeric with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('--Hello--')).toBe('hello');
  });

  it('collapses consecutive non-alpha chars', () => {
    expect(slugify('A  B!!C')).toBe('a-b-c');
  });
});

describe('amazonURL', () => {
  it('links straight to the product when an ASIN is known', () => {
    expect(amazonURL('Wingspan', 'B07YQ641NQ')).toBe('https://www.amazon.com/dp/B07YQ641NQ');
  });

  it('falls back to an encoded Amazon search without an ASIN', () => {
    expect(amazonURL('7 Wonders Duel')).toBe(
      'https://www.amazon.com/s?k=7%20Wonders%20Duel%20board%20game',
    );
  });
});

describe('priceTrackerURL', () => {
  it('points at the CamelCamelCamel page for the ASIN', () => {
    expect(priceTrackerURL('B07YQ641NQ')).toBe('https://camelcamelcamel.com/product/B07YQ641NQ');
  });
});
