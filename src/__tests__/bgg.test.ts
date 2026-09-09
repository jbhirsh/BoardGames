import { describe, it, expect, vi } from 'vitest';
import { parseThing, pickSearchId, summarise, lookupGame, type FetchLike } from '../../api/_lib/bgg';

const THING = `<?xml version="1.0" encoding="utf-8"?>
<items termsofuse="https://boardgamegeek.com/xmlapi/termsofuse">
  <item type="boardgame" id="266192">
    <thumbnail>https://cf.geekdo-images.com/x.jpg</thumbnail>
    <name type="primary" sortindex="1" value="Wingspan" />
    <name type="alternate" sortindex="1" value="Fl&#252;gelschlag" />
    <description>Wingspan is a competitive, medium-weight, card-driven, engine-building board game from Stonemaier Games.&#10;&#10;You are bird enthusiasts&amp;mdash;researchers, bird watchers, ornithologists, and collectors&amp;mdash;seeking to discover and attract the best birds to your network of wildlife preserves. Each bird extends a chain of powerful combinations in one of your habitats. These habitats focus on several key aspects of growth.</description>
    <yearpublished value="2019" />
    <minplayers value="1" />
    <maxplayers value="5" />
    <playingtime value="70" />
    <minplaytime value="40" />
    <maxplaytime value="70" />
    <link type="boardgamecategory" id="1002" value="Card Game" />
    <link type="boardgamecategory" id="1089" value="Animals" />
    <link type="boardgamemechanic" id="2664" value="Deck, Bag, and Pool Building" />
    <statistics page="1">
      <ratings>
        <ranks>
          <rank type="subtype" id="1" name="boardgame" friendlyname="Board Game Rank" value="28" bayesaverage="7.9" />
          <rank type="family" id="5497" name="strategygames" friendlyname="Strategy Game Rank" value="22" bayesaverage="7.9" />
          <rank type="family" id="5499" name="familygames" friendlyname="Family Game Rank" value="3" bayesaverage="7.9" />
        </ranks>
      </ratings>
    </statistics>
  </item>
</items>`;

const SEARCH = `<items total="3" termsofuse="x">
  <item type="boardgame" id="292859"><name type="primary" value="Wingspan: European Expansion"/><yearpublished value="2019"/></item>
  <item type="boardgame" id="266192"><name type="primary" value="Wingspan"/><yearpublished value="2019"/></item>
  <item type="boardgame" id="300000"><name type="primary" value="Wingspan Asia"/><yearpublished value="2022"/></item>
</items>`;

describe('summarise', () => {
  it('decodes entities, strips markup, and keeps the first sentences under the cap', () => {
    const out = summarise('First one.&#10;&#10;Second &amp;mdash; here! Third goes on and on and on.', 60);
    expect(out).toBe('First one. Second — here!');
  });

  it('keeps decimals whole and a trailing unpunctuated sentence', () => {
    expect(summarise('Version 2.0 of the classic game. It plays in about 1.5 hours')).toBe('Version 2.0 of the classic game. It plays in about 1.5 hours');
  });

  it('leaves an out-of-range numeric entity as written instead of throwing', () => {
    expect(summarise('&#9999999; boom')).toBe('&#9999999; boom');
  });

  it('truncates a single very long sentence on a word boundary', () => {
    const out = summarise('word '.repeat(80), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns empty for empty input', () => {
    expect(summarise('')).toBe('');
  });

  it('decodes multi-digit hex entities and code points up to U+10FFFF, leaving larger ones raw', () => {
    expect(summarise('It&#x2019;s fun.')).toBe('It\u2019s fun.');
    expect(summarise('a&#x10FFFF;b')).toBe('a\u{10FFFF}b');
    expect(summarise('a&#x110000;b')).toBe('a&#x110000;b');
    expect(summarise('a&#0;b')).toBe('a\u0000b');
  });

  it('strips multi-character tags, collapses runs of whitespace and trims the ends', () => {
    expect(summarise('  Hello<br />big   <em>bold</em> world.  ')).toBe('Hello big bold world.');
  });

  it('keeps exactly two sentences', () => {
    expect(summarise('One. Two! Three? Four.')).toBe('One. Two!');
  });

  it('does not truncate at exactly max, but cuts on a word boundary with an ellipsis above it', () => {
    expect(summarise('aaaa bbbb', 9)).toBe('aaaa bbbb');
    expect(summarise('aaaa bbbb', 8)).toBe('aaaa…');
    expect(summarise('aaaa bbbb cccc', 10)).toBe('aaaa…');
  });
});

describe('parseThing', () => {
  it('reads players, time, year, description and keywords from ranks, categories and mechanics', () => {
    const d = parseThing(THING)!;
    expect(d).toMatchObject({ bggId: 266192, name: 'Wingspan', year: 2019, min: 1, max: 5, mins: 70 });
    expect(d.desc.startsWith('Wingspan is a competitive')).toBe(true);
    expect(d.desc).toContain('bird enthusiasts—researchers');
    expect(d.kw.sort()).toEqual(['card-game', 'deck-building', 'family', 'strategy']);
  });

  it('returns null without an item', () => {
    expect(parseThing('<items></items>')).toBeNull();
  });

  it('defaults sensibly when fields are missing and tags short games quick-play', () => {
    const d = parseThing('<items><item type="boardgame" id="7"><name type="primary" value="Tiny"/><playingtime value="10"/></item></items>')!;
    expect(d).toMatchObject({ min: 1, max: 1, mins: 10, desc: '', year: undefined });
    expect(d.kw).toEqual(['quick-play']);
  });

  it("treats BGG's value=\"0\" sentinels as unknown", () => {
    const d = parseThing('<items><item type="boardgame" id="7"><name type="primary" value="Obscure"/><minplayers value="0"/><maxplayers value="0"/><yearpublished value="0"/></item></items>')!;
    expect(d).toMatchObject({ min: 1, max: 1, year: undefined });
  });

  it('reads rank names regardless of attribute order', () => {
    const d = parseThing('<items><item type="boardgame" id="7"><name type="primary" value="X"/><statistics><ratings><ranks><rank type="family" id="5497" friendlyname="Strategy Game Rank" name="strategygames" value="22"/></ranks></ratings></statistics></item></items>')!;
    expect(d.kw).toEqual(['strategy']);
  });

  const thing = (inner: string) => parseThing(`<items><item type="boardgame" id="7">${inner}</item></items>`)!;

  it('ignores unranked ranks and rank tags missing an attribute', () => {
    expect(thing('<rank type="family" name="strategygames" value="Not Ranked"/>').kw).toEqual([]);
    expect(thing('<rank type="family" name="strategygames"/>').kw).toEqual([]);
    expect(thing('<rank type="family" value="22"/>').kw).toEqual([]);
  });

  it('only maps category and mechanic links that carry a value', () => {
    expect(thing('<link type="boardgamefamily" id="1" value="Party Game"/>').kw).toEqual([]);
    expect(thing('<link type="boardgamecategory" id="1"/>').kw).toEqual([]);
    expect(thing('<link type="boardgamemechanic" id="1" value="Party Game"/>').kw).toEqual(['party']);
  });

  it('tags quick-play up to and including 15 minutes', () => {
    expect(thing('<playingtime value="15"/>').kw).toEqual(['quick-play']);
    expect(thing('<playingtime value="16"/>').kw).toEqual([]);
  });

  it('reads the primary name in any attribute order and tolerates its absence', () => {
    expect(thing('<name sortindex="1" type="primary" value="Order"/>').name).toBe('Order');
    expect(thing('<name value="Reversed" type="primary"/>').name).toBe('Reversed');
    expect(thing('<name type="alternate" value="Alt"/><name value="Second" type="primary"/>').name).toBe('Second');
    expect(thing('<name type="alternate" value="Alt"/>').name).toBe('');
    expect(thing('<name type="primary"/>').name).toBe('');
    expect(thing('').name).toBe('');
  });
});

describe('pickSearchId', () => {
  it('prefers an exact (normalised) name match over the first hit', () => {
    expect(pickSearchId(SEARCH, 'wingspan')).toBe(266192);
    expect(pickSearchId(SEARCH, 'WINGSPAN!')).toBe(266192);
  });

  it('accepts a match on the title before a colon', () => {
    expect(pickSearchId(SEARCH, 'wingspan european expansion')).toBe(292859);
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(pickSearchId(SEARCH, 'Wingspan Oceania')).toBeNull();
    expect(pickSearchId('<items total="0"></items>', 'x')).toBeNull();
    expect(pickSearchId(SEARCH, '---')).toBeNull();
  });

  const item = (id: number, name?: string) =>
    `<item type="boardgame" id="${id}">${name === undefined ? '' : `<name type="primary" value="${name}"/>`}<yearpublished value="2020"/></item>`;

  it('matches the title before a colon only when the whole name starts with it', () => {
    expect(pickSearchId(`<items>${item(1, 'Sounds Fishy: Party Edition')}</items>`, 'sounds fishy')).toBe(1);
    expect(pickSearchId(`<items>${item(2, 'Wingspan Asia')}</items>`, 'wingspan')).toBeNull();
    expect(pickSearchId(`<items>${item(3, 'Fishy: Sounds')}</items>`, 'sounds')).toBeNull();
  });

  it('tolerates an item without a name and never matches it on an empty target', () => {
    expect(pickSearchId(`<items>${item(5)}</items>`, 'wingspan')).toBeNull();
    expect(pickSearchId(`<items>${item(5)}</items>`, '---')).toBeNull();
  });
});

describe('lookupGame', () => {
  const respond = (status: number, body = '') => Promise.resolve({ status, text: async () => body });

  it('searches exactly, then fetches the thing, with a timeout signal on every request', async () => {
    const calls: string[] = [];
    const signals: unknown[] = [];
    const fetchLike: FetchLike = vi.fn(async (url: string, init?: { signal?: AbortSignal }) => {
      calls.push(url);
      signals.push(init?.signal);
      if (url.includes('/search?')) return respond(200, SEARCH);
      return respond(200, THING);
    });
    const d = await lookupGame('Wingspan', fetchLike);
    expect(d?.bggId).toBe(266192);
    expect(calls[0]).toContain('exact=1&query=Wingspan');
    expect(calls[1]).toContain('/thing?id=266192&stats=1');
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
  });

  it('retries a 202 once and falls back to a loose search when exact finds nothing', async () => {
    vi.useFakeTimers();
    const statuses = [202, 200, 200, 200];
    const bodies = ['', '<items total="0"></items>', SEARCH, THING];
    let i = 0;
    const fetchLike: FetchLike = vi.fn(async () => { const r = respond(statuses[i], bodies[i]); i++; return r; });
    const p = lookupGame('WINGSPAN', fetchLike);
    await vi.runAllTimersAsync();
    const d = await p;
    vi.useRealTimers();
    expect(d?.name).toBe('Wingspan');
    expect(fetchLike).toHaveBeenCalledTimes(4);
  });

  it('gives up once the time budget is spent instead of retrying', async () => {
    const fetchLike: FetchLike = vi.fn(async () => respond(202));
    expect(await lookupGame('Wingspan', fetchLike, 1000)).toBeNull();
    // Exact search 202 with < RETRY_MS left means no retry, then the loose search also 202s once.
    expect(fetchLike).toHaveBeenCalledTimes(2);
  });

  it('retries a persistent 202 exactly once per request when time allows', async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    const fetchLike: FetchLike = vi.fn(async (url: string) => { calls.push(url); return respond(202); });
    const p = lookupGame('Wingspan', fetchLike, 60_000);
    await vi.runAllTimersAsync();
    const d = await p;
    vi.useRealTimers();
    expect(d).toBeNull();
    expect(calls.filter((u) => u.includes('exact=1'))).toHaveLength(2);
    expect(calls.filter((u) => !u.includes('exact=1'))).toHaveLength(2);
  });

  it('does not fetch at all when the budget is already exhausted', async () => {
    vi.useFakeTimers();
    const fetchLike: FetchLike = vi.fn(async () => respond(202));
    const d = await lookupGame('Wingspan', fetchLike, 0);
    vi.useRealTimers();
    expect(d).toBeNull();
    expect(fetchLike).not.toHaveBeenCalled();
  });

  it('does not wait for a retry when exactly the retry interval is left', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const fetchLike: FetchLike = vi.fn(async () => respond(202));
    const p = lookupGame('Wingspan', fetchLike, 1500);
    await vi.runAllTimersAsync();
    const d = await p;
    const elapsed = Date.now() - start;
    vi.useRealTimers();
    expect(d).toBeNull();
    expect(elapsed).toBe(0);
    expect(fetchLike).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-202 error', async () => {
    vi.useFakeTimers();
    const fetchLike: FetchLike = vi.fn(async () => respond(500));
    const p = lookupGame('x', fetchLike);
    await vi.runAllTimersAsync();
    const d = await p;
    vi.useRealTimers();
    expect(d).toBeNull();
    expect(fetchLike).toHaveBeenCalledTimes(2);
  });

  it('returns null when BGG errors or nothing matches the typed name', async () => {
    expect(await lookupGame('x', vi.fn(async () => respond(500)))).toBeNull();
    expect(await lookupGame('x', vi.fn(async () => respond(200, '<items total="0"></items>')))).toBeNull();
    expect(await lookupGame('Wingspan Oceania', vi.fn(async () => respond(200, SEARCH)))).toBeNull();
  });
});
