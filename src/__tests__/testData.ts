import type { Game } from '../data/types';

export const quickGame: Game = {
  name: 'Quick Game',
  players: '2–4',
  min: 2,
  max: 4,
  dur: '10 min',
  mins: 10,
  cat: 'quick',
  group: 'party',
  kw: ['card-game', 'family'],
  short: 'A quick card game.',
  desc: 'A fast-paced card game for the whole family.',
  detail: '<div class="detail-section"><h3>How to Play</h3><p>Play cards fast.</p></div>',
  yt: 'how to play quick game',
};

export const mediumGame: Game = {
  name: 'Medium Game',
  players: '3–6',
  min: 3,
  max: 6,
  dur: '45 min',
  mins: 45,
  cat: 'medium',
  group: 'strat',
  kw: ['strategy', 'classic'],
  short: 'A medium strategy game.',
  desc: 'A classic strategy game with moderate playtime.',
  detail: '<div class="detail-section"><h3>Strategy</h3><p>Think hard.</p></div>',
  yt: 'how to play medium game',
};

export const longGame: Game = {
  name: 'Long Game',
  players: '2–5',
  min: 2,
  max: 5,
  dur: '2 hrs',
  mins: 120,
  cat: 'long',
  group: 'coop',
  kw: ['cooperative', 'thematic'],
  short: 'A long cooperative game.',
  desc: 'An epic cooperative adventure lasting hours.',
  detail: '<div class="detail-section"><h3>Adventure</h3><p>Work together.</p></div>',
  yt: 'how to play long game',
};

export const testGames: Game[] = [quickGame, mediumGame, longGame];
