import { describe, expect, it } from 'vitest';
import { shortDesc } from '../utils/shortDesc';

describe('shortDesc', () => {
  it('keeps the first sentence and drops the rest', () => {
    expect(shortDesc('Build a zoo. Two scoring tracks move toward each other.')).toBe('Build a zoo.');
    expect(shortDesc('Tense, sharp, and quick! Plays in 30 min.')).toBe('Tense, sharp, and quick!');
    expect(shortDesc('Who is lying? Find out.')).toBe('Who is lying?');
  });

  it('keeps a closing quote or bracket that follows the stop', () => {
    expect(shortDesc('\u201cMean fun. You\u2019d love it.\u201d')).toBe('\u201cMean fun.');
    expect(shortDesc('Sam said "Go." Then we played.')).toBe('Sam said "Go."');
    expect(shortDesc('Two hours (at least). Bring snacks.')).toBe('Two hours (at least).');
  });

  it('returns a one-sentence blurb whole, with or without a final stop', () => {
    expect(shortDesc('Draft tiles to complete your mosaic.')).toBe('Draft tiles to complete your mosaic.');
    expect(shortDesc('  Draft tiles to complete your mosaic  ')).toBe('Draft tiles to complete your mosaic');
  });

  it('splits at the first stop followed by a space, so decimals survive and abbreviations do not', () => {
    expect(shortDesc('Plays in 2.5 hours with up to 4 people. Heavy.')).toBe('Plays in 2.5 hours with up to 4 people.');
    expect(shortDesc('Set in the U.S.A. during the gold rush. Bid for claims.')).toBe('Set in the U.S.A.');
  });
});
