import { describe, expect, it } from 'vitest';
import { ordinal, places, tieNotes, type TieBreak } from '../utils/standings';
import { ROUTE_LENGTHS, ROUTE_POINTS, routePoints, ttrBreakdown, ttrTieBreaks, type TtrTally } from '../utils/ticketToRide';
import { dominionBreakdown, type DominionTally } from '../utils/dominion';

describe('places', () => {
  it('places by total, sharing a place and skipping the next', () => {
    expect(places([30, 50, 30, 10])).toEqual([2, 1, 2, 4]);
  });

  it('breaks a tie on each tie-break in turn', () => {
    const breaks: TieBreak[] = [{ label: 'a', values: [1, 1, 0] }, { label: 'b', values: [2, 5, 9] }];
    expect(places([7, 7, 7], breaks)).toEqual([2, 1, 3]);
  });
});

describe('ordinal', () => {
  it('names places as English does, teens included', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '103rd']);
  });
});

describe('tieNotes', () => {
  const shown = (totals: number[]) => totals.map((t) => `${t} points`);

  it('says nothing when no two players share a total', () => {
    expect(tieNotes(['Ana', 'Ben'], shown([3, 4]), [3, 4], [])).toEqual([]);
  });

  it('says which tie-break settled a tie, showing each value as asked', () => {
    const card: TieBreak = { label: 'the card', values: [0, 1, 0], show: (v) => (v ? 'has it' : "doesn't") };
    expect(tieNotes(['Ana', 'Ben', 'Cy'], shown([9, 9, 4]), [9, 9, 4], [card]))
      .toEqual(["Ana and Ben tie on 9 points, broken on the card: Ana doesn't, Ben has it."]);
  });

  it('names who still share a place after the tie-break', () => {
    const made: TieBreak = { label: 'tickets completed', values: [2, 2, 3] };
    expect(tieNotes(['Ana', 'Ben', 'Cy'], shown([5, 5, 5]), [5, 5, 5], [made]))
      .toEqual(['Ana, Ben and Cy tie on 5 points, broken on tickets completed: Ana 2, Ben 2, Cy 3. Ana and Ben still share 2nd.']);
  });

  it('says a tie no tie-break settles is shared', () => {
    const made: TieBreak = { label: 'tickets completed', values: [2, 2] };
    expect(tieNotes(['Ana', 'Ben'], shown([5, 5]), [5, 5], [made])).toEqual(['Ana and Ben tie on 5 points and every tie-break, so they share 1st place.']);
    expect(tieNotes(['Ana', 'Ben'], shown([5, 5]), [5, 5], [])).toEqual(['Ana and Ben tie on 5 points, so they share 1st place.']);
  });

  it('lists ties from the top', () => {
    expect(tieNotes(['A', 'B', 'C', 'D'], shown([1, 9, 1, 9]), [1, 9, 1, 9], []).map((n) => n.slice(0, 7))).toEqual(['B and D', 'A and C']);
  });
});

describe('Ticket to Ride', () => {
  const tally = (t: Partial<TtrTally>): TtrTally => ({ routes: {}, tickets: [], longest: false, stationsLeft: 0, ...t });

  it('scores routes by the printed table, each map its own lengths', () => {
    expect(ROUTE_LENGTHS.usa.map((l) => ROUTE_POINTS[l])).toEqual([1, 2, 4, 7, 10, 15]);
    expect(ROUTE_LENGTHS.europe.map((l) => ROUTE_POINTS[l])).toEqual([1, 2, 4, 7, 15, 21]);
    const routes = { 1: 2, 5: 1, 6: 1, 8: 1 };
    expect(routePoints('usa', routes)).toEqual(2 + 10 + 15);
    expect(routePoints('europe', routes)).toEqual(2 + 15 + 21);
  });

  it('adds completed tickets, takes off failed ones, and adds the bonuses', () => {
    const t = tally({
      routes: { 4: 2 },
      tickets: [{ points: 12, made: true }, { points: 8, made: false }, { points: 0, made: true }],
      longest: true,
      stationsLeft: 2,
    });
    expect(ttrBreakdown('usa', t)).toEqual({ routes: 14, made: 12, missed: -8, longest: 10, stations: 0, total: 28, ticketsMade: 1 });
    expect(ttrBreakdown('europe', t)).toMatchObject({ stations: 8, total: 36 });
  });

  it('scores nothing at all as zero, not minus zero', () => {
    expect(Object.is(ttrBreakdown('usa', tally({})).missed, 0)).toBe(true);
  });

  it('breaks ties on tickets, then (in Europe) stations kept, then the longest path card', () => {
    const tallies = [tally({ stationsLeft: 1, longest: true }), tally({ stationsLeft: 3 })];
    expect(ttrTieBreaks('usa', tallies).map((b) => b.label)).toEqual(['tickets completed', 'the longest path card']);
    const europe = ttrTieBreaks('europe', tallies);
    expect(europe.map((b) => b.values)).toEqual([[0, 0], [1, 3], [1, 0]]);
    expect(places([50, 50], europe)).toEqual([2, 1]);
    expect(places([50, 50], ttrTieBreaks('usa', tallies))).toEqual([1, 2]);
    expect(europe[2].show!(1)).toBe('has it');
    expect(europe[2].show!(0)).toBe("doesn't");
  });
});

describe('Dominion', () => {
  const tally = (t: Partial<DominionTally>): DominionTally => ({
    estates: 0, duchies: 0, provinces: 0, curses: 0, gardens: 0, deck: 0, duke: 0, harem: 0, mill: 0, nobles: 0, ...t,
  });

  it('scores the base Victory cards and Curses', () => {
    expect(dominionBreakdown(tally({ estates: 3, duchies: 2, provinces: 4, curses: 2 }), new Set()))
      .toMatchObject({ estates: 3, duchies: 6, provinces: 24, curses: -2, total: 31 });
  });

  it('scores the Kingdom cards in the game, and only those', () => {
    const t = tally({ duchies: 3, gardens: 2, deck: 39, duke: 2, harem: 1, mill: 3, nobles: 2 });
    const all = dominionBreakdown(t, new Set(['gardens', 'duke', 'harem', 'mill', 'nobles']));
    // Gardens: 3 each (39 cards); Duke: 3 each (3 Duchies).
    expect(all).toMatchObject({ duchies: 9, gardens: 6, duke: 6, harem: 2, mill: 3, nobles: 4, total: 30 });
    expect(dominionBreakdown(t, new Set(['mill']))).toMatchObject({ gardens: 0, duke: 0, harem: 0, mill: 3, nobles: 0, total: 12 });
  });

  it('scores no Curses as zero, not minus zero', () => {
    expect(Object.is(dominionBreakdown(tally({}), new Set()).curses, 0)).toBe(true);
  });
});
