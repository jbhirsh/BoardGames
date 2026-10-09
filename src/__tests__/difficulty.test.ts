import { describe, it, expect } from 'vitest';
import { difficultyOf, weightLabel, weightWord } from '../utils/difficulty';
import type { SubGame } from '../data/types';

describe('weightWord', () => {
  it('is Light under 2, Medium under 3 and Heavy from 3', () => {
    expect(weightWord(1)).toBe('Light');
    expect(weightWord(1.99)).toBe('Light');
    expect(weightWord(2)).toBe('Medium');
    expect(weightWord(2.99)).toBe('Medium');
    expect(weightWord(3)).toBe('Heavy');
    expect(weightWord(4.5)).toBe('Heavy');
  });
});

describe('weightLabel', () => {
  it('reads "Medium · 2.3", BGG\'s weight to one decimal', () => {
    expect(weightLabel(2.31)).toBe('Medium · 2.3');
    expect(weightLabel(1)).toBe('Light · 1.0');
  });

  it('names the number it shows, so a weight just under a band reads as the band it rounds into', () => {
    expect(weightLabel(1.96)).toBe('Medium · 2.0');
    expect(weightLabel(1.94)).toBe('Light · 1.9');
    expect(weightLabel(2.97)).toBe('Heavy · 3.0');
  });
});

describe('difficultyOf', () => {
  const sub = (weight?: number): SubGame => ({
    name: 'S', slug: 's', kind: 'card-game', players: '2', min: 2, max: 2, dur: '5 min', mins: 5,
    cat: 'quick', short: '', yt: '', weight,
  });

  it('labels a game by its own weight', () => {
    expect(difficultyOf({ weight: 2.28 })).toBe('Medium · 2.3');
  });

  it('spans a deck\'s games, which carry the weight the deck lacks, skipping unrated ones', () => {
    expect(difficultyOf({ subgames: [sub(1), sub(1.92), sub()] })).toBe('Light · 1.0–1.9');
    expect(difficultyOf({ subgames: [sub(1.2), sub(2.4)] })).toBe('Light–Medium · 1.2–2.4');
  });

  it('gives one value, not a range, when the games agree', () => {
    expect(difficultyOf({ subgames: [sub(1.1), sub(1.1)] })).toBe('Light · 1.1');
    // Equal as shown, though not as fetched.
    expect(difficultyOf({ subgames: [sub(1.08), sub(1.12)] })).toBe('Light · 1.1');
    expect(difficultyOf({ subgames: [sub(1.2), sub(1.97)] })).toBe('Light–Medium · 1.2–2.0');
  });

  it('is nothing when BoardGameGeek rates none of it', () => {
    expect(difficultyOf({})).toBeNull();
    expect(difficultyOf({ subgames: [sub()] })).toBeNull();
  });
});
