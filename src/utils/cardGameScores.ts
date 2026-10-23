// The card games' running scores, for the round-by-round pad
// (components/RoundScorePad.tsx). The rules are CARD_GAMES' in
// data/scoreCalculators.ts, which says in each game's `rule` what this
// scores; the tests check the two agree.
import type { CardGameGoal, CardGameId } from '../data/scoreCalculators';

/**
 * One round as the pad records it. Columns are players, or for Spades and
 * Euchre the two partnerships (players 1 and 3, then 2 and 4).
 */
export type Round =
  /** Uno and Rummy: who went out, and the points left in each hand (the winner's is ignored). */
  | { game: 'uno' | 'rummy'; out: number; hands: readonly number[] }
  /** The points each player took, or who shot the moon. */
  | { game: 'hearts'; moon: number | null; taken: readonly number[] }
  /** Each player's six cards' score for the hole. */
  | { game: 'golf'; scores: readonly number[] }
  /** Each of the four players' bid (0 for nil) and tricks. */
  | { game: 'spades'; bids: readonly number[]; tricks: readonly number[] }
  /** Which partnership chose trump, the tricks it took, and whether one of them went alone. */
  | { game: 'euchre'; makers: 0 | 1; tricks: number; alone: boolean };

export const HEARTS_HAND = 26;
export const SPADES_TRICKS = 13;
export const EUCHRE_TRICKS = 5;
const BAGS_PER_PENALTY = 10;
const BAG_PENALTY = 100;
const NIL = 100;

/** A partnership's points for a Spades hand, and the bags it took. */
export function spadesHand(bids: readonly number[], tricks: readonly number[]): { points: number; bags: number } {
  let points = 0;
  let bags = 0;
  let contract = 0;
  let taken = 0;
  bids.forEach((bid, seat) => {
    if (bid === 0) {
      // Nil: scored alone, 100 made or minus 100 failed. The sheet says no
      // more; its tricks count as the partnership's bags but score nothing.
      points += tricks[seat] === 0 ? NIL : -NIL;
      bags += tricks[seat];
    } else {
      contract += bid;
      taken += tricks[seat];
    }
  });
  if (contract > 0) {
    if (taken >= contract) {
      points += 10 * contract + (taken - contract);
      bags += taken - contract;
    } else {
      points -= 10 * contract;
    }
  }
  return { points, bags };
}

/** The makers' points for a Euchre hand, or the defenders' 2 when the makers are euchred. */
export function euchreHand(tricks: number, alone: boolean): { makers: number; defenders: number } {
  if (tricks < 3) return { makers: 0, defenders: 2 };
  if (tricks < EUCHRE_TRICKS) return { makers: 1, defenders: 0 };
  return { makers: alone ? 4 : 2, defenders: 0 };
}

export interface Scored {
  /** Each round's points, by column, the bag penalty included in the round it fell. */
  points: number[][];
  totals: number[];
  /** Spades: the bags each partnership carries toward its next penalty. */
  bags?: number[];
}

/** Every round's points and the running totals, for `columns` players or partnerships. */
export function scoreRounds(rounds: readonly Round[], columns: number): Scored {
  const totals = Array<number>(columns).fill(0);
  const bags = Array<number>(columns).fill(0);
  let spades = false;
  const points = rounds.map((round) => {
    const row = Array<number>(columns).fill(0);
    switch (round.game) {
      case 'uno':
      case 'rummy':
        row[round.out] = round.hands.reduce((sum, h, i) => (i === round.out ? sum : sum + h), 0);
        break;
      case 'hearts':
        row.forEach((_, i) => {
          row[i] = round.moon === null ? round.taken[i] : i === round.moon ? 0 : HEARTS_HAND;
        });
        break;
      case 'golf':
        row.forEach((_, i) => {
          row[i] = round.scores[i];
        });
        break;
      case 'spades':
        spades = true;
        for (const team of [0, 1]) {
          const seats = [team, team + 2];
          const hand = spadesHand(
            seats.map((s) => round.bids[s]),
            seats.map((s) => round.tricks[s]),
          );
          row[team] = hand.points;
          bags[team] += hand.bags;
          while (bags[team] >= BAGS_PER_PENALTY) {
            bags[team] -= BAGS_PER_PENALTY;
            row[team] -= BAG_PENALTY;
          }
        }
        break;
      case 'euchre': {
        const hand = euchreHand(round.tricks, round.alone);
        row[round.makers] = hand.makers;
        row[1 - round.makers] = hand.defenders;
        break;
      }
    }
    row.forEach((p, i) => {
      totals[i] += p;
    });
    return row;
  });
  return spades ? { points, totals, bags } : { points, totals };
}

/**
 * Whether the game is over, and who leads (several on a tie): the lowest
 * total where the lowest wins. A game to a target ends once anyone reaches
 * it, the best total then winning; a game of a set number of rounds ends
 * after the last.
 */
export function outcome(
  goal: CardGameGoal,
  totals: readonly number[],
  rounds: number,
): { over: boolean; leaders: number[] } {
  const best = goal.low ? Math.min(...totals) : Math.max(...totals);
  const leaders = totals.flatMap((t, i) => (t === best ? [i] : []));
  const over = 'to' in goal ? rounds > 0 && totals.some((t) => t >= goal.to) : rounds >= goal.rounds;
  return { over, leaders };
}

/**
 * What doesn't add up in a round as entered, said plainly, or null. The
 * pad shows it and still lets the round be saved: a table may play a
 * variation the pad doesn't know.
 */
export function roundIssue(round: Round): string | null {
  const sum = (list: readonly number[]) => list.reduce((a, b) => a + b, 0);
  if (
    round.game === 'hearts' &&
    round.moon === null &&
    round.taken.includes(HEARTS_HAND) &&
    sum(round.taken) === HEARTS_HAND
  ) {
    return 'One player took all 26: did they shoot the moon? Say who above, and everyone else scores 26 instead.';
  }
  if (round.game === 'hearts' && round.moon === null && sum(round.taken) !== HEARTS_HAND) {
    return `These add up to ${sum(round.taken)}. A hand holds ${HEARTS_HAND}: 13 hearts and the queen of spades.`;
  }
  if (round.game === 'spades' && sum(round.tricks) !== SPADES_TRICKS) {
    return `The tricks add up to ${sum(round.tricks)}. A hand has ${SPADES_TRICKS}.`;
  }
  return null;
}

const isCount = (v: unknown, max = Infinity): v is number =>
  Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max;
const isScore = (v: unknown): v is number => Number.isSafeInteger(v);
const listOf = (v: unknown, length: number, item: (x: unknown) => boolean) =>
  Array.isArray(v) && v.length === length && v.every(item);

/**
 * Whether a saved value is a round of `game` for `players` players, so a
 * pad loads only what it could have written.
 */
export function isRound(game: CardGameId, players: number, v: unknown): v is Round {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.game !== game) return false;
  switch (game) {
    case 'uno':
    case 'rummy':
      return isCount(r.out, players - 1) && listOf(r.hands, players, (x) => isCount(x));
    case 'hearts':
      return (
        (r.moon === null || isCount(r.moon, players - 1)) && listOf(r.taken, players, (x) => isCount(x, HEARTS_HAND))
      );
    case 'golf':
      return listOf(r.scores, players, isScore);
    case 'spades':
      return (
        listOf(r.bids, 4, (x) => isCount(x, SPADES_TRICKS)) && listOf(r.tricks, 4, (x) => isCount(x, SPADES_TRICKS))
      );
    case 'euchre':
      return (r.makers === 0 || r.makers === 1) && isCount(r.tricks, EUCHRE_TRICKS) && typeof r.alone === 'boolean';
  }
}
