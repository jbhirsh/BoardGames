import { describe, it, expect } from 'vitest';
import { formatMinutes, collectionSpan } from '../utils/collectionStats';
import { GAMES } from '../data/games';
import type { Game } from '../data/types';

function game(mins: number): Game {
  return { mins } as Game;
}

describe('formatMinutes', () => {
  it('keeps sub-hour durations in minutes', () => {
    expect(formatMinutes(10)).toBe('10 min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(59)).toBe('59 min');
  });

  it('uses the singular for exactly one hour', () => {
    expect(formatMinutes(60)).toBe('1 hr');
  });

  it('uses whole hours when the value divides evenly', () => {
    expect(formatMinutes(120)).toBe('2 hrs');
    expect(formatMinutes(480)).toBe('8 hrs');
  });

  it('keeps one decimal place for partial hours', () => {
    expect(formatMinutes(90)).toBe('1.5 hrs');
    expect(formatMinutes(150)).toBe('2.5 hrs');
  });
});

describe('collectionSpan', () => {
  it('returns the shortest and longest formatted durations', () => {
    expect(collectionSpan([game(30), game(10), game(480)])).toEqual({
      shortest: '10 min',
      longest: '8 hrs',
    });
  });

  it('handles a single game', () => {
    expect(collectionSpan([game(60)])).toEqual({ shortest: '1 hr', longest: '1 hr' });
  });

  it('tracks the real collection so the hero cannot go stale', () => {
    const { shortest, longest } = collectionSpan(GAMES);
    const mins = GAMES.map((g) => g.mins);
    expect(shortest).toBe(formatMinutes(Math.min(...mins)));
    expect(longest).toBe(formatMinutes(Math.max(...mins)));
  });
});
