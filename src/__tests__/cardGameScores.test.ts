import { describe, expect, it } from 'vitest';
import { euchreHand, isRound, outcome, roundIssue, scoreRounds, spadesHand, type Round } from '../utils/cardGameScores';
import { CARD_GAMES } from '../data/scoreCalculators';

describe('scoreRounds', () => {
  it('gives the player who went out the points left in every other hand', () => {
    const rounds: Round[] = [
      { game: 'uno', out: 1, hands: [40, 999, 25] },
      { game: 'uno', out: 0, hands: [0, 12, 70] },
    ];
    expect(scoreRounds(rounds, 3)).toEqual({ points: [[0, 65, 0], [82, 0, 0]], totals: [82, 65, 0] });
  });

  it('scores Hearts as taken, or 26 to everyone else when someone shoots the moon', () => {
    const rounds: Round[] = [
      { game: 'hearts', moon: null, taken: [13, 5, 8, 0] },
      { game: 'hearts', moon: 2, taken: [0, 0, 0, 0] },
    ];
    expect(scoreRounds(rounds, 4)).toEqual({ points: [[13, 5, 8, 0], [26, 26, 0, 26]], totals: [39, 31, 8, 26] });
  });

  it('adds up Golf holes, below zero included', () => {
    const rounds: Round[] = [{ game: 'golf', scores: [-2, 14] }, { game: 'golf', scores: [5, -4] }];
    expect(scoreRounds(rounds, 2).totals).toEqual([3, 10]);
  });

  it('scores Euchre for the makers, or 2 to the defenders when they are euchred', () => {
    const rounds: Round[] = [
      { game: 'euchre', makers: 0, tricks: 3, alone: false },
      { game: 'euchre', makers: 1, tricks: 5, alone: true },
      { game: 'euchre', makers: 1, tricks: 2, alone: false },
    ];
    expect(scoreRounds(rounds, 2)).toEqual({ points: [[1, 0], [0, 4], [2, 0]], totals: [3, 4] });
  });

  it('carries Spades bags from hand to hand, taking 100 off at every tenth', () => {
    const hand = (overs: number): Round => ({ game: 'spades', bids: [3, 3, 2, 2], tricks: [3 + overs, 3, 2, 2 - overs] });
    // Partnership 1 (players 1 and 3) bids 5 and takes 5 + overs.
    const { points, totals, bags } = scoreRounds([hand(4), hand(4), hand(3)], 2);
    expect(points[0][0]).toBe(54);
    expect(points[1][0]).toBe(54);
    // The 11th bag comes in the third hand: 53 - 100.
    expect(points[2][0]).toBe(-47);
    expect(bags).toEqual([1, 0]);
    expect(totals[0]).toBe(61);
  });

  it('takes the penalty in the hand that brings the tenth bag, beside two nils made', () => {
    const { points, bags } = scoreRounds([{ game: 'spades', bids: [1, 0, 1, 0], tricks: [11, 0, 1, 0] }], 2);
    // Partnership 1 bids 2, takes 12: 20 + 10 bags = 30, less 100. Partnership 2: two nils made, 200.
    expect(points[0]).toEqual([-70, 200]);
    expect(bags).toEqual([0, 0]);
  });
});

describe('spadesHand', () => {
  it('scores a made contract at 10 a trick bid and a bag a trick over', () => {
    expect(spadesHand([4, 3], [5, 3])).toEqual({ points: 71, bags: 1 });
  });

  it('takes 10 a trick bid off a contract that falls short', () => {
    expect(spadesHand([4, 3], [4, 2])).toEqual({ points: -70, bags: 0 });
  });

  it('scores a nil on its own, its partner\'s bid on its partner\'s tricks', () => {
    expect(spadesHand([0, 4], [0, 4])).toEqual({ points: 140, bags: 0 });
    // A failed nil: -100 flat, its two tricks bags that score nothing and
    // don't help the partner, who falls short.
    expect(spadesHand([0, 4], [2, 3])).toEqual({ points: -100 - 40, bags: 2 });
  });
});

describe('euchreHand', () => {
  it('pays 1 for 3 or 4 tricks, 2 for a march, 4 for a lone march', () => {
    expect(euchreHand(3, false)).toEqual({ makers: 1, defenders: 0 });
    expect(euchreHand(4, true)).toEqual({ makers: 1, defenders: 0 });
    expect(euchreHand(5, false)).toEqual({ makers: 2, defenders: 0 });
    expect(euchreHand(5, true)).toEqual({ makers: 4, defenders: 0 });
    expect(euchreHand(0, false)).toEqual({ makers: 0, defenders: 2 });
  });
});

describe('outcome', () => {
  it('ends a game to a target once anyone reaches it, the best total winning', () => {
    expect(outcome(CARD_GAMES.uno.goal, [480, 499], 6)).toEqual({ over: false, leaders: [1] });
    expect(outcome(CARD_GAMES.uno.goal, [520, 505], 7)).toEqual({ over: true, leaders: [0] });
    expect(outcome(CARD_GAMES.euchre.goal, [10, 10], 9)).toEqual({ over: true, leaders: [0, 1] });
  });

  it('crowns the lowest where the lowest wins', () => {
    expect(outcome(CARD_GAMES.hearts.goal, [102, 40, 40], 8)).toEqual({ over: true, leaders: [1, 2] });
    expect(outcome(CARD_GAMES.golf.goal, [30, 28], 8)).toEqual({ over: false, leaders: [1] });
    expect(outcome(CARD_GAMES.golf.goal, [30, 28], 9).over).toBe(true);
  });

  it('is not over before a round is played, whatever the target', () => {
    expect(outcome({ to: 0, low: false }, [0, 0], 0).over).toBe(false);
  });
});

describe('roundIssue', () => {
  it('says when a Hearts hand doesn\'t add up to 26', () => {
    expect(roundIssue({ game: 'hearts', moon: null, taken: [10, 5, 6, 0] })).toBe('These add up to 21. A hand holds 26: 13 hearts and the queen of spades.');
    expect(roundIssue({ game: 'hearts', moon: null, taken: [13, 13, 0] })).toBeNull();
    expect(roundIssue({ game: 'hearts', moon: 1, taken: [0, 0, 0] })).toBeNull();
  });

  it('asks whether a Hearts hand all in one player\'s hands was a moon shot', () => {
    expect(roundIssue({ game: 'hearts', moon: null, taken: [0, 26, 0] })).toBe('One player took all 26: did they shoot the moon? Say who above, and everyone else scores 26 instead.');
    expect(roundIssue({ game: 'hearts', moon: null, taken: [26, 5, 0] })).toMatch(/These add up to 31/);
  });

  it('says when a Spades hand\'s tricks don\'t add up to 13', () => {
    expect(roundIssue({ game: 'spades', bids: [3, 3, 3, 3], tricks: [3, 3, 3, 3] })).toBe('The tricks add up to 12. A hand has 13.');
    expect(roundIssue({ game: 'spades', bids: [3, 3, 3, 3], tricks: [4, 3, 3, 3] })).toBeNull();
  });

  it('has nothing to say about the other games', () => {
    expect(roundIssue({ game: 'golf', scores: [99] })).toBeNull();
  });
});

describe('isRound', () => {
  it('takes a round of the game for its number of players', () => {
    expect(isRound('rummy', 2, { game: 'rummy', out: 1, hands: [12, 0] })).toBe(true);
    expect(isRound('hearts', 3, { game: 'hearts', moon: null, taken: [13, 13, 0] })).toBe(true);
    expect(isRound('golf', 2, { game: 'golf', scores: [-4, 12] })).toBe(true);
    expect(isRound('spades', 4, { game: 'spades', bids: [0, 3, 4, 5], tricks: [1, 3, 4, 5] })).toBe(true);
    expect(isRound('euchre', 4, { game: 'euchre', makers: 1, tricks: 5, alone: true })).toBe(true);
  });

  it('refuses another game\'s round, a different table, or a malformed one', () => {
    expect(isRound('uno', 2, { game: 'rummy', out: 0, hands: [0, 3] })).toBe(false);
    expect(isRound('uno', 3, { game: 'uno', out: 0, hands: [0, 3] })).toBe(false);
    expect(isRound('uno', 2, { game: 'uno', out: 2, hands: [0, 3] })).toBe(false);
    expect(isRound('hearts', 3, { game: 'hearts', moon: null, taken: [27, 0, 0] })).toBe(false);
    expect(isRound('golf', 2, { game: 'golf', scores: [1.5, 2] })).toBe(false);
    expect(isRound('spades', 4, { game: 'spades', bids: [1, 1, 1], tricks: [1, 1, 1, 1] })).toBe(false);
    expect(isRound('euchre', 4, { game: 'euchre', makers: 2, tricks: 3, alone: false })).toBe(false);
    expect(isRound('euchre', 4, null)).toBe(false);
    expect(isRound('euchre', 4, 'hand')).toBe(false);
  });
});
