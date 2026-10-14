import { filterWishlist } from '../utils/filterGames';
import { WISHLIST } from '../data/wishlist';
import { GROUP_ORDER, WISHLIST_TYPE_ORDER } from '../data/keywords';
import { describe, it, expect } from 'vitest';
import { filterGames, sortItems, sortedKw, isGrouped, fitsTable, tableFiltered, budgetFor, groupGames, groupItems } from '../utils/filterGames';
import { GAMES } from '../data/games';
import { initialFilterState } from '../data/initialFilterState';
import { testGames, quickGame, mediumGame, longGame } from './testData';
import type { FilterState, Filterable, Game, SortMode, SubGame } from '../data/types';
import { durationCategory } from '../utils/duration';

// The collection's sort: sortItems with the games' group order, as
// filterGames applies it.
function sortGames(list: Game[], sort: string): Game[] {
  return sortItems(list, sort, (g) => GROUP_ORDER.indexOf(g.group));
}

function makeState(overrides: Partial<FilterState> = {}): FilterState {
  return { ...initialFilterState, ...overrides };
}

describe('filterGames', () => {
  it('returns all games with default filters', () => {
    const result = filterGames(testGames, makeState());
    expect(result).toHaveLength(3);
  });

  describe('duration filter', () => {
    // The fixtures take 10, 45 and 120 minutes.
    it('keeps every game that fits the time budget, quick ones included', () => {
      expect(filterGames(testGames, makeState({ duration: 15 }))).toEqual([quickGame]);
      expect(filterGames(testGames, makeState({ duration: 30 }))).toEqual([quickGame]);
      expect(filterGames(testGames, makeState({ duration: 60 })).map((g) => g.name).sort()).toEqual(['Medium Game', 'Quick Game']);
    });

    it('shows a game longer than every budget only with no time chosen', () => {
      expect(filterGames(testGames, makeState({ duration: 60 }))).not.toContain(longGame);
      expect(filterGames(testGames, makeState())).toContain(longGame);
    });

    // A game's own minutes decide, not its Quick/Medium/Long bucket: Love
    // Letter (20 min) is "medium" but fits half an hour.
    it('judges a game by its minutes, the budget itself included', () => {
      const twenty = { ...mediumGame, name: 'Twenty', slug: 'twenty', mins: 20 };
      const thirty = { ...twenty, name: 'Thirty', slug: 'thirty', mins: 30 };
      const thirtyOne = { ...twenty, name: 'Thirty-one', slug: 'thirty-one', mins: 31 };
      expect(filterGames([twenty, thirty, thirtyOne], makeState({ duration: 30 }))).toEqual([thirty, twenty]);
    });
  });

  describe('players filter', () => {
    it('filters by player count within range', () => {
      const result = filterGames(testGames, makeState({ players: 2 }));
      expect(result).toHaveLength(2); // quickGame (2-4) and longGame (2-5)
      expect(result.map(g => g.name)).toContain('Quick Game');
      expect(result.map(g => g.name)).toContain('Long Game');
    });

    it('returns no results for impossible player count', () => {
      const result = filterGames(testGames, makeState({ players: 100 }));
      expect(result).toHaveLength(0);
    });

    it('returns all when players is 0', () => {
      const result = filterGames(testGames, makeState({ players: 0 }));
      expect(result).toHaveLength(3);
    });

    // Both range checks are inclusive: a game is playable at exactly its min
    // and exactly its max seat count. These pin the boundaries so `g.min <=`
    // and `g.max >=` can't be weakened to strict `<` / `>`.
    it('includes a game when players equals its max seat count', () => {
      // longGame seats 2–5; at exactly 5 it must still appear.
      const result = filterGames(testGames, makeState({ players: 5 }));
      expect(result.map(g => g.name)).toContain('Long Game');
    });

    it('includes a game when players equals its min seat count', () => {
      // mediumGame seats 3–6; at exactly 3 it must still appear.
      const result = filterGames(testGames, makeState({ players: 3 }));
      expect(result.map(g => g.name)).toContain('Medium Game');
    });
  });

  describe('keyword filter (AND logic)', () => {
    it('filters by single keyword', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['strategy']), keywordMode: 'and' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Medium Game');
    });

    it('filters by multiple keywords (AND)', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['card-game', 'family']), keywordMode: 'and' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Quick Game');
    });

    it('returns empty when no game matches all keywords', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['strategy', 'cooperative']), keywordMode: 'and' }));
      expect(result).toHaveLength(0);
    });
  });

  describe('keyword filter (OR logic)', () => {
    it('returns games matching any keyword', () => {
      const result = filterGames(testGames, makeState({ keywords: new Set(['strategy', 'cooperative']), keywordMode: 'or' }));
      expect(result).toHaveLength(2);
    });
  });

  describe('search filter', () => {
    it('searches by name', () => {
      const result = filterGames(testGames, makeState({ search: 'quick' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Quick Game');
    });

    it('searches by description', () => {
      const result = filterGames(testGames, makeState({ search: 'epic cooperative' }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Long Game');
    });

    it('search is case-insensitive', () => {
      const result = filterGames(testGames, makeState({ search: 'MEDIUM' }));
      expect(result).toHaveLength(1);
    });

    it('ignores whitespace around the search text', () => {
      // Guards the `.trim()`: a query pasted with stray spaces must still hit.
      const result = filterGames(testGames, makeState({ search: '  quick  ' }));
      expect(result.map(g => g.name)).toEqual(['Quick Game']);
    });
  });

  describe('combined filters', () => {
    it('applies duration + players together', () => {
      // 15 minutes for 3 people: quickGame (2-4) matches
      const result = filterGames(testGames, makeState({ duration: 15, players: 3 }));
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Quick Game');
    });

    it('returns empty when filters conflict', () => {
      // Quick games with strategy keyword: none match
      const result = filterGames(testGames, makeState({ duration: 15, keywords: new Set(['strategy']) }));
      expect(result).toHaveLength(0);
    });
  });
  describe('games inside a game', () => {
    const speed: SubGame = {
      name: 'Speed', slug: 'speed', kind: 'card-game', players: '2', min: 2, max: 2,
      dur: '5 min', mins: 5, short: 'Race.', yt: 'how to play speed',
    };
    const president: SubGame = {
      name: 'President', slug: 'president', kind: 'card-game', players: '4–8', min: 4, max: 8,
      dur: '30 min', mins: 30, short: 'Shed your hand.', yt: 'how to play president',
    };
    // The deck's own summary would fit one player and a long game; it is
    // never played on its own, so only its games may keep it.
    const deck: Game = { ...longGame, name: 'Deck', slug: 'deck', min: 1, max: 1, subgames: [speed, president] };
    // A base game with an add-on is a game in its own right.
    const island: Game = { ...longGame, name: 'Island', slug: 'island', subgames: [{ ...president, kind: 'expansion' }] };

    it('keeps the parent when one of its games fits the players and time', () => {
      expect(filterGames([deck], makeState({ players: 2, duration: 15 }))).toEqual([deck]);
      expect(filterGames([deck], makeState({ players: 6 }))).toEqual([deck]);
    });

    it('needs one game to fit both, not one each', () => {
      // President fits 6 players and Speed fits 15 minutes, but neither fits both.
      expect(filterGames([deck], makeState({ players: 6, duration: 15 }))).toEqual([]);
    });

    it('still drops a parent when nothing in it fits', () => {
      expect(filterGames([deck], makeState({ players: 9 }))).toEqual([]);
    });

    it('drops a deck whose own summary fits when none of its games do', () => {
      expect(filterGames([deck], makeState({ players: 1 }))).toEqual([]);
      expect(filterGames([{ ...deck, mins: 10, subgames: [president] }], makeState({ duration: 15 }))).toEqual([]);
    });

    it('keeps a base game that fits on its own when none of its add-ons do', () => {
      const quickIsland = { ...island, mins: 10 };
      expect(filterGames([quickIsland], makeState({ players: 2, duration: 15 }))).toEqual([quickIsland]);
      expect(filterGames([island], makeState({ players: 7 }))).toEqual([island]);
      expect(filterGames([island], makeState({ players: 9 }))).toEqual([]);
    });

    it('finds the parent by the name of a game inside it', () => {
      expect(filterGames([deck, quickGame], makeState({ search: 'presid' }))).toEqual([deck]);
    });
  });
});

describe('fitsTable', () => {
  const g = { min: 2, max: 4, mins: 30 };

  it('fits everything with no players or time chosen', () => {
    expect(fitsTable(g, makeState())).toBe(true);
  });

  it('checks the players at both ends of the range', () => {
    expect(fitsTable(g, makeState({ players: 2 }))).toBe(true);
    expect(fitsTable(g, makeState({ players: 4 }))).toBe(true);
    expect(fitsTable(g, makeState({ players: 1 }))).toBe(false);
    expect(fitsTable(g, makeState({ players: 5 }))).toBe(false);
  });

  it('checks the time budget, letting an unknown time through', () => {
    expect(fitsTable(g, makeState({ duration: 30 }))).toBe(true);
    expect(fitsTable(g, makeState({ duration: 60 }))).toBe(true);
    expect(fitsTable(g, makeState({ duration: 15 }))).toBe(false);
    expect(fitsTable({ ...g, mins: 0 }, makeState({ duration: 15 }))).toBe(true);
  });
});

describe('budgetFor', () => {
  it('is the smallest budget a play time fits', () => {
    expect(budgetFor(5)).toBe(15);
    expect(budgetFor(15)).toBe(15);
    expect(budgetFor(16)).toBe(30);
    expect(budgetFor(30)).toBe(30);
    expect(budgetFor(45)).toBe(60);
    expect(budgetFor(60)).toBe(60);
  });

  it('is none for a game longer than every budget or with no known time', () => {
    expect(budgetFor(61)).toBeUndefined();
    expect(budgetFor(0)).toBeUndefined();
  });
});

describe('tableFiltered', () => {
  it('is on when players or time narrows the list', () => {
    expect(tableFiltered(makeState())).toBe(false);
    expect(tableFiltered(makeState({ players: 3 }))).toBe(true);
    expect(tableFiltered(makeState({ duration: 60 }))).toBe(true);
    // Keywords and search don't change which games inside a card fit.
    expect(tableFiltered(makeState({ search: 'x', keywords: new Set(['party']) }))).toBe(false);
  });
});

describe('sortGames', () => {
  it('sorts alphabetically (az)', () => {
    const result = sortGames(testGames, 'az');
    expect(result.map(g => g.name)).toEqual(['Long Game', 'Medium Game', 'Quick Game']);
  });

  it('sorts by name descending', () => {
    const result = sortGames(testGames, 'name-desc');
    expect(result.map(g => g.name)).toEqual(['Quick Game', 'Medium Game', 'Long Game']);
  });

  it('sorts quickest first', () => {
    const result = sortGames(testGames, 'quick');
    expect(result.map(g => g.mins)).toEqual([10, 45, 120]);
  });

  it('sorts longest first', () => {
    const result = sortGames(testGames, 'long');
    expect(result.map(g => g.mins)).toEqual([120, 45, 10]);
  });

  it('sorts by group order', () => {
    const result = sortGames(testGames, 'group');
    // GROUP_ORDER: social, word, party, strat, coop
    expect(result.map(g => g.group)).toEqual(['party', 'strat', 'coop']);
  });

  it('sorts by player count ascending, breaking ties by max seats', () => {
    // Primary key is min seats ascending; when two games share a min, the
    // smaller max comes first. quickGame (2–4) before longGame (2–5), then
    // mediumGame (3–6). Guards the `a.min - b.min || a.max - b.max` comparator.
    const result = sortGames([mediumGame, longGame, quickGame], 'players-asc');
    expect(result.map(g => g.name)).toEqual(['Quick Game', 'Long Game', 'Medium Game']);
  });

  it('sorts by player count descending, breaking ties by max seats', () => {
    // Mirror of players-asc: min seats descending, ties broken by larger max
    // first. mediumGame (3–6), then longGame (2–5) before quickGame (2–4). Input
    // is deliberately unsorted so a no-op comparator can't pass by coincidence.
    const result = sortGames([longGame, quickGame, mediumGame], 'players-desc');
    expect(result.map(g => g.name)).toEqual(['Medium Game', 'Long Game', 'Quick Game']);
  });

  it('sorts the real lists by play time as it did with the time bucket as a tie-break', () => {
    // The sorts once broke equal times by the bucket (quick < medium <
    // long), but the bucket is worked out from `mins`, so equal times share
    // one and it never decided anything. Compared here against that old
    // comparator on the collection and the wishlist, an unknown time among
    // them.
    const RANK = { quick: 0, medium: 1, long: 2 } as const;
    const known = (m: number) => m || Number.MAX_SAFE_INTEGER;
    const rank = (m: number) => (m ? RANK[durationCategory(m)] : RANK.medium);
    const unknown = { ...WISHLIST[0], id: 'sug-x', name: 'Mystery', mins: 0, dur: '' };
    for (const list of [GAMES, [...WISHLIST, unknown]] as Filterable[][]) {
      expect(sortItems(list, 'dur-asc', () => 0))
        .toEqual([...list].sort((a, b) => known(a.mins) - known(b.mins) || rank(a.mins) - rank(b.mins)));
      expect(sortItems(list, 'dur-desc', () => 0))
        .toEqual([...list].sort((a, b) => b.mins - a.mins || rank(b.mins) - rank(a.mins)));
    }
  });
});

describe('filterWishlist', () => {
  it('applies the same filters to wishlist entries', () => {
    const two = filterWishlist(WISHLIST, { ...initialFilterState, keywords: new Set(), players: 2 });
    expect(two.every((w) => w.min <= 2 && w.max >= 2)).toBe(true);
    expect(two.length).toBeLessThan(WISHLIST.length);

    const quick = filterWishlist(WISHLIST, { ...initialFilterState, keywords: new Set(), duration: 15 });
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.every((w) => w.mins <= 15)).toBe(true);

    const coop = filterWishlist(WISHLIST, { ...initialFilterState, keywords: new Set(['cooperative']) });
    expect(coop.every((w) => w.kw.includes('cooperative'))).toBe(true);
    expect(coop.map((w) => w.id)).toContain('the-crew');
  });

  it('keeps items with an unknown play time under every time budget', () => {
    const unknown = { ...WISHLIST[0], id: 'sug-x', name: 'Mystery', mins: 0 };
    const quick = filterWishlist([...WISHLIST, unknown], { ...initialFilterState, keywords: new Set(), duration: 15 });
    expect(quick.map((w) => w.id)).toContain('sug-x');
  });

  it('groups by wishlist type under the group sort', () => {
    const grouped = filterWishlist(WISHLIST, { ...initialFilterState, keywords: new Set(), sort: 'group', baseSort: 'group' });
    const order = grouped.map((w) => WISHLIST_TYPE_ORDER.indexOf(w.type));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('sortItems ordering', () => {
  // A fixture whose input order matches none of the sorted outputs, so a
  // dropped branch (falling through to the group sort) or a no-op comparator
  // can't pass by coincidence. Names, groups, minutes and seats are all
  // deliberately out of step with one another.
  const mk = (name: string, over: Partial<Game>): Game => ({ ...quickGame, name, slug: name.toLowerCase(), ...over });
  const bravo   = mk('Bravo',   { group: 'party', mins: 60, min: 2, max: 4 });
  const alpha   = mk('Alpha',   { group: 'coop',  mins: 20, min: 2, max: 8 });
  const charlie = mk('Charlie', { group: 'strat', mins: 40, min: 4, max: 4 });
  const delta   = mk('Delta',   { group: 'word',  mins: 40, min: 2, max: 6 });
  const input = [bravo, alpha, charlie, delta];
  const names = (list: Game[]) => list.map(g => g.name);

  it('starts the vote sort from A→Z, which the wishlist reorders by votes', () => {
    expect(names(sortItems(input, 'votes', () => 0))).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it.each(['az', 'name-asc'])('%s sorts A to Z', (sort) => {
    expect(names(sortGames(input, sort))).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
  });

  it('name-desc sorts Z to A', () => {
    expect(names(sortGames(input, 'name-desc'))).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
  });

  it.each(['quick', 'dur-asc'])('%s sorts shortest first, equal times in their incoming order', (sort) => {
    // Charlie and Delta are both 40 min, and stay as the input has them.
    expect(names(sortGames(input, sort))).toEqual(['Alpha', 'Charlie', 'Delta', 'Bravo']);
  });

  it.each(['quick', 'dur-asc', 'long', 'dur-desc'])('%s puts an unknown play time (mins 0) last', (sort) => {
    // A suggestion whose lookup failed has mins 0: not the quickest game,
    // just one we know nothing about.
    const unknown = mk('Unknown', { mins: 0 });
    const sorted = names(sortGames([unknown, bravo, alpha], sort));
    expect(sorted[sorted.length - 1]).toBe('Unknown');
  });

  it.each(['long', 'dur-desc'])('%s sorts longest first, equal times in their incoming order', (sort) => {
    // Input has Delta ahead of Charlie, both 40 min, and they stay that way.
    expect(names(sortGames([alpha, delta, charlie, bravo], sort))).toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);
  });

  it('players-asc sorts by min seats, then max seats', () => {
    expect(names(sortGames(input, 'players-asc'))).toEqual(['Bravo', 'Delta', 'Alpha', 'Charlie']);
  });

  it('players-desc sorts by min seats, then max seats, not by max alone', () => {
    // Charlie (4-4) has the highest min but the lowest max, so it must lead;
    // the 2-seat trio then orders by max 8 > 6 > 4.
    expect(names(sortGames(input, 'players-desc'))).toEqual(['Charlie', 'Alpha', 'Delta', 'Bravo']);
  });

  it('group sort follows GROUP_ORDER regardless of input order', () => {
    // GROUP_ORDER: social, word, party, strat, coop
    expect(names(sortGames(input, 'group'))).toEqual(['Delta', 'Bravo', 'Charlie', 'Alpha']);
  });

  it('group sort orders items A to Z within a group', () => {
    const zed = mk('Zed', { group: 'strat' });
    const apple = mk('Apple', { group: 'strat' });
    const mango = mk('Mango', { group: 'coop' });
    expect(names(sortGames([zed, apple, mango], 'group'))).toEqual(['Apple', 'Zed', 'Mango']);
  });

  it('group sort uses the supplied groupIndex', () => {
    const byLength = (g: Game) => g.name.length;
    expect(names(sortItems([charlie, bravo, alpha, delta], 'group', byLength))).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie']);
  });
});

describe('isGrouped', () => {
  it('is on when group is the sort or the base under a column sort, off otherwise', () => {
    expect(isGrouped(makeState({ sort: 'group', baseSort: 'group' }))).toBe(true);
    expect(isGrouped(makeState({ sort: 'name-asc', baseSort: 'group' }))).toBe(true);
    expect(isGrouped(makeState({ sort: 'group', baseSort: 'az' }))).toBe(true);
    expect(isGrouped(makeState({ sort: 'az', baseSort: 'az' }))).toBe(false);
  });
});

describe('groupItems', () => {
  const list = ['b2', 'a1', 'c1', 'a2', 'b1'];
  const first = (s: string) => s[0];

  it('splits a list into its groups in the given order, each in the list\'s own order', () => {
    expect(groupItems(list, ['c', 'a', 'b'], first)).toEqual([
      { key: 'c', items: ['c1'] },
      { key: 'a', items: ['a1', 'a2'] },
      { key: 'b', items: ['b2', 'b1'] },
    ]);
  });

  it('leaves out a group with nothing in it', () => {
    expect(groupItems(list, ['d', 'a', 'e'], first)).toEqual([{ key: 'a', items: ['a1', 'a2'] }]);
    expect(groupItems([], ['a'], first)).toEqual([]);
  });
});

describe('groupGames', () => {
  // How GridView and ListView grouped the filtered games themselves before
  // the filter did it for them: every group in GROUP_ORDER with a game
  // showing, each in the filtered order, or the filtered list as it is.
  function viewsGrouping(games: Game[], state: FilterState) {
    if (!isGrouped(state)) return [{ key: null, items: games }];
    return GROUP_ORDER
      .filter((g) => games.some((gm) => gm.group === g))
      .map((key) => ({ key, items: games.filter((g) => g.group === key) }));
  }

  const SORTS: SortMode[] = [
    'az', 'group', 'quick', 'long', 'votes',
    'name-asc', 'name-desc', 'dur-asc', 'dur-desc',
    'players-asc', 'players-desc', 'weight-asc', 'weight-desc',
  ];
  const filters: Partial<FilterState>[] = [{}, { players: 4 }, { duration: 30 }, { search: 'pandemic' }, { search: 'zzzz' }];

  it('groups every sort, on the group base or not, as the views did', () => {
    for (const baseSort of ['az', 'group'] as SortMode[]) {
      for (const sort of SORTS) {
        for (const filter of filters) {
          const state = makeState({ ...filter, sort, baseSort });
          const games = filterGames(GAMES, state);
          expect(groupGames(games, state), `${sort} on ${baseSort} ${JSON.stringify(filter)}`).toEqual(viewsGrouping(games, state));
        }
      }
    }
  });

  it('heads each kind of game in the groups\' order, by name within', () => {
    const state = makeState({ sort: 'group', baseSort: 'group' });
    const groups = groupGames(filterGames(GAMES, state), state);
    expect(groups.map((g) => g.key)).toEqual(GROUP_ORDER.filter((id) => GAMES.some((g) => g.group === id)));
    for (const { key, items } of groups) {
      expect(items.every((g) => g.group === key)).toBe(true);
      expect(items.map((g) => g.name)).toEqual(items.map((g) => g.name).sort((a, b) => a.localeCompare(b)));
    }
    expect(groups.flatMap((g) => g.items)).toHaveLength(GAMES.length);
  });

  it('keeps the groups under a column sort, ordering each by the column', () => {
    const state = makeState({ sort: 'players-desc', baseSort: 'group' });
    const sorted = filterGames(GAMES, state);
    for (const { key, items } of groupGames(sorted, state)) {
      expect(items).toEqual(sorted.filter((g) => g.group === key));
    }
  });

  it('is one flat list, the same array, under any other sort', () => {
    const state = makeState({ sort: 'quick', baseSort: 'quick' });
    const games = filterGames(GAMES, state);
    const groups = groupGames(games, state);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBeNull();
    expect(groups[0].items).toBe(games);
  });

  it('heads only the groups with a game showing', () => {
    const state = makeState({ sort: 'group', baseSort: 'group', search: 'pandemic' });
    expect(groupGames(filterGames(GAMES, state), state).map((g) => g.key)).toEqual(['coop']);
    expect(groupGames([], state)).toEqual([]);
  });
});

describe('sortedKw', () => {
  it('orders keywords by their display label', () => {
    // Card Game, Social, Thematic, Word
    expect(sortedKw(['word', 'thematic', 'card-game', 'social'])).toEqual(['card-game', 'social', 'thematic', 'word']);
  });

  it('falls back to the raw key for keywords KW does not know', () => {
    expect(sortedKw(['zz-mystery', 'yy-mystery', 'xx-mystery'])).toEqual(['xx-mystery', 'yy-mystery', 'zz-mystery']);
  });

  it('interleaves known labels and unknown keys in one order', () => {
    expect(sortedKw(['zz-mystery', 'word', 'aa-mystery', 'family'])).toEqual(['aa-mystery', 'family', 'word', 'zz-mystery']);
  });

  it('does not mutate its input', () => {
    const kw = ['word', 'family'];
    sortedKw(kw);
    expect(kw).toEqual(['word', 'family']);
  });
});

describe('weight sort', () => {
  const a = { ...quickGame, name: 'A', weight: 2.4 };
  const b = { ...mediumGame, name: 'B', weight: 1.2 };
  const c = { ...longGame, name: 'C', weight: 1.2 };
  const unknown = { ...longGame, name: 'Unknown' };
  const card = { slug: 'x', kind: 'card-game' as const, players: '2', min: 2, max: 2, dur: '5 min', mins: 5, short: '', yt: '' };
  // A deck spanning 1.1 to 3.0: lightest first it is a 1.1, heaviest first a 3.0.
  const deck: Game = {
    ...mediumGame, name: 'Deck',
    subgames: [{ ...card, name: 'Snap', weight: 1.1 }, { ...card, name: 'Bridge', weight: 3 }],
  };
  const names = (list: Game[]) => list.map((g) => g.name);

  it('puts the lightest first, ties by name, a deck by its lightest game and unknowns last', () => {
    expect(names(sortGames([unknown, a, deck, c, b], 'weight-asc'))).toEqual(['Deck', 'B', 'C', 'A', 'Unknown']);
  });

  it('puts the heaviest first, a deck by its heaviest game, unknowns still last', () => {
    expect(names(sortGames([unknown, b, a, deck, c], 'weight-desc'))).toEqual(['Deck', 'A', 'B', 'C', 'Unknown']);
  });
});