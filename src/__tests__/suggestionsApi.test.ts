// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// The lookup's token reports go through reportError; spied here so a test
// can see them without a Sentry client.
vi.mock('../../api/_lib/sentry.js', async (importActual) => ({
  ...(await importActual<typeof import('../../api/_lib/sentry')>()),
  reportError: vi.fn(async () => {}),
}));
import { eq, ne } from 'drizzle-orm';
import {
  addGame,
  decideSuggestion,
  editGame,
  openEmailed,
  pendingList,
  previewEmailed,
  previewGame,
  removeGame,
  suggestGame,
  type SuggestionsDeps,
} from '../../api/_resolvers/suggestions';
import { listGames } from '../../api/_resolvers/games';
import { ApiError } from '../../api/_resolvers/errors';
import { bggInfo, games, ownerAwards, suggestions } from '../../api/_db/schema';
import { resendMailer, type Mail } from '../../api/_lib/mail';
import { reportError } from '../../api/_lib/sentry';
import { parseThing, type GameDetails, type LookupResult } from '../../api/_lib/bgg';
import { MINS_MAX, NOTE_MAX, PLAYERS_MAX } from '../../api/_lib/limits';
import { abortReason } from './helpers/abortReason';
import { testDb, type TestDb } from './helpers/testDb';
import { curated, pendingRow, seed } from './helpers/rows';

type Found = Omit<GameDetails, 'categories' | 'mechanics' | 'section'> & Partial<GameDetails>;
const found = (details: Found): LookupResult => ({
  outcome: 'found',
  details: { categories: [], mechanics: [], section: 'strategy', ...details },
});

const WINGSPAN = {
  bggId: 266192,
  name: 'Wingspan',
  year: 2019,
  min: 1,
  max: 5,
  mins: 70,
  desc: 'Birds.',
  kw: ['strategy'],
  img: 'https://cf.geekdo-images.com/w.jpg',
  weight: 2.48,
  summary: 'Attract birds.',
  honours: [{ name: 'Kennerspiel des Jahres', year: 2019, result: 'Winner' }],
};

let db: TestDb;
let sent: Mail[];
beforeEach(async () => {
  db = await testDb();
  sent = [];
});
afterEach(() => db.close());

/** The services' dependencies on the test's database, with `over` changed. */
const deps = (over: Partial<SuggestionsDeps> = {}): SuggestionsDeps => ({
  db: async () => db.db,
  mailer: {
    send: vi.fn(async (m: Mail) => {
      sent.push(m);
    }),
  },
  baseUrl: () => 'https://games.example',
  lookup: null,
  now: () => 5000,
  randomId: () => 'sug-bbbbbb',
  ...over,
});

/** What a call refused with. */
async function refusal(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error('expected a refusal');
}

const rows = async () => ({
  games: await db.db.select().from(games),
  suggestions: await db.db.select().from(suggestions),
  info: await db.db.select().from(bggInfo),
});

describe('suggestGame', () => {
  it('stores a pending suggestion and emails the owner links that carry only its id', async () => {
    const item = await suggestGame(deps(), { game: ' Cascadia ', name: 'Sam', note: '  Calm   one ' });
    expect(item).toEqual({
      id: 'sug-bbbbbb',
      game: 'Cascadia',
      name: 'Sam',
      note: 'Calm one',
      status: 'pending',
      createdAt: 5000,
      source: 'friend',
    });
    expect((await rows()).suggestions).toMatchObject([{ id: 'sug-bbbbbb', status: 'pending', gameId: null }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Game suggestion: Cascadia (from Sam)');
    expect(sent[0].html).toContain('https://games.example/approve?id=sug-bbbbbb"');
    expect(sent[0].html).toContain('https://games.example/deny?id=sug-bbbbbb"');
    expect(sent[0].html).not.toMatch(/token/i);
    expect(sent[0].html).toContain('Sign in on the site to decide');
  });

  it("takes BoardGameGeek's spelling only when it differs in case, spacing or punctuation", async () => {
    const spelling = vi.fn(async (name: string) => (name === 'spirit island' ? 'Spirit Island' : 'Skull'));
    expect((await suggestGame(deps({ spelling }), { game: 'spirit  island', name: 'Jess' })).game).toBe(
      'Spirit Island',
    );
    await db.db.delete(suggestions).where(ne(suggestions.id, ''));
    expect((await suggestGame(deps({ spelling }), { game: 'Skull and Roses', name: 'Robin' })).game).toBe(
      'Skull and Roses',
    );
  });

  it('keeps the name as typed when the spelling lookup finds nothing (as it answers any failure)', async () => {
    expect((await suggestGame(deps({ spelling: async () => null }), { game: 'azul', name: 'Sam' })).game).toBe('azul');
  });

  it('refuses a game already on the wishlist or waiting, whatever its case and punctuation', async () => {
    await seed(db.db, { gameRows: [curated()], suggestionRows: [pendingRow()] });
    const listed = await refusal(
      suggestGame(deps(), { game: 'seti: search for extraterrestrial intelligence', name: 'Sam' }),
    );
    expect([listed.status, listed.message]).toEqual([
      409,
      'SETI: Search for Extraterrestrial Intelligence is already on the wishlist',
    ]);
    const waiting = await refusal(suggestGame(deps(), { game: 'WINGSPAN!', name: 'Sam' }));
    expect(waiting.message).toBe('Wingspan has already been suggested and is waiting for approval');
    expect(sent).toHaveLength(0);
  });

  it("sends the same person's unsent suggestion of the game again under its id, so the queue holds it once", async () => {
    await seed(db.db, { suggestionRows: [pendingRow({ status: 'unsent', gameName: 'Azul' })] });
    const again = await suggestGame(deps(), { game: 'azul', name: 'alex' });
    expect(again).toMatchObject({ id: 'sug-aaaaaa', status: 'pending' });
    expect((await rows()).suggestions.map((s) => [s.id, s.status])).toEqual([['sug-aaaaaa', 'pending']]);
    expect(sent).toHaveLength(1);
  });

  it("keeps another person's unsent suggestion of the same game as theirs, beside the new one", async () => {
    await seed(db.db, {
      suggestionRows: [pendingRow({ status: 'unsent', gameName: 'Azul', name: 'Robin', note: 'Ours' })],
    });
    const again = await suggestGame(deps(), { game: 'azul', name: 'Sam', note: 'Mine' });
    expect(again).toMatchObject({ id: 'sug-bbbbbb', name: 'Sam', status: 'pending' });
    expect((await rows()).suggestions.map((s) => [s.id, s.name, s.note, s.status]).sort()).toEqual([
      ['sug-aaaaaa', 'Robin', 'Ours', 'unsent'],
      ['sug-bbbbbb', 'Sam', 'Mine', 'pending'],
    ]);
  });

  it('sends one the owner decided before the resend as a new suggestion, under a new id', async () => {
    await seed(db.db, { suggestionRows: [pendingRow({ status: 'unsent', gameName: 'Azul' })] });
    // The owner denies it from the queue while the friend's resend is on its way.
    const spelling = vi.fn(async () => {
      await db.db
        .update(suggestions)
        .set({ status: 'denied', decidedAt: 6000 })
        .where(eq(suggestions.id, 'sug-aaaaaa'));
      return null;
    });
    const again = await suggestGame(deps({ spelling }), { game: 'azul', name: 'Alex' });
    expect(again).toMatchObject({ id: 'sug-bbbbbb', status: 'pending' });
    expect((await rows()).suggestions.map((s) => [s.id, s.status]).sort()).toEqual([
      ['sug-aaaaaa', 'denied'],
      ['sug-bbbbbb', 'pending'],
    ]);
  });

  it('takes a game again once it was taken off the wishlist', async () => {
    await seed(db.db, { gameRows: [curated({ status: 'removed' })] });
    expect(
      (await suggestGame(deps(), { game: 'SETI: Search for Extraterrestrial Intelligence', name: 'Sam' })).status,
    ).toBe('pending');
  });

  it.each([
    [{ game: 'x', name: 'Sam' }, 'game must be 2–80 characters'],
    [{ game: 'Azul', name: '' }, 'name must be 1–30 letters, digits, spaces or basic punctuation'],
    [{ game: 'Azul', name: 'Sam', note: 'x'.repeat(201) }, 'note must be at most 200 characters'],
  ])('refuses %o with a 400', async (input, message) => {
    const err = await refusal(suggestGame(deps(), input));
    expect([err.status, err.message]).toEqual([400, message]);
  });

  it('answers 503 without email configured, storing nothing', async () => {
    expect((await refusal(suggestGame(deps({ mailer: null }), { game: 'Azul', name: 'Sam' }))).status).toBe(503);
    expect((await rows()).suggestions).toEqual([]);
  });

  it('escapes suggester text in the email', async () => {
    await suggestGame(deps(), { game: 'Tak <3', name: 'Sam', note: '<img src=x>' });
    expect(sent[0].html).toContain('Tak &lt;3');
    expect(sent[0].html).toContain('&lt;img src=x&gt;');
    expect(sent[0].html).not.toContain('<img src=x>');
  });

  it('marks it unsent when Resend hangs, rather than waiting out the function', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('SUGGESTIONS_TO', 'owner@example.com');
    try {
      // Answers only by failing once the mailer's timeout aborts it.
      const hanging = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(abortReason(init.signal)));
          }),
      );
      await expect(
        suggestGame(deps({ mailer: resendMailer(hanging, 10) }), { game: 'Azul', name: 'Sam' }),
      ).rejects.toThrow();
      expect(hanging).toHaveBeenCalledTimes(1);
      expect((await rows()).suggestions).toMatchObject([{ id: 'sug-bbbbbb', status: 'unsent' }]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('marks a suggestion whose email failed unsent, so the friend can try again, unless it was decided meanwhile', async () => {
    const mailer = {
      send: vi.fn(async () => {
        throw new Error('resend down');
      }),
    };
    await expect(suggestGame(deps({ mailer }), { game: 'Azul', name: 'Sam' })).rejects.toThrow('resend down');
    expect((await rows()).suggestions[0].status).toBe('unsent');
    expect((await suggestGame(deps({ randomId: () => 'sug-cccccc' }), { game: 'Azul', name: 'Sam' })).status).toBe(
      'pending',
    );

    await db.db.delete(suggestions).where(ne(suggestions.id, ''));
    const racing = {
      send: vi.fn(async () => {
        await db.db
          .update(suggestions)
          .set({ status: 'denied', decidedAt: 6000 })
          .where(eq(suggestions.id, 'sug-bbbbbb'));
        throw new Error('resend down');
      }),
    };
    await expect(suggestGame(deps({ mailer: racing }), { game: 'Azul', name: 'Sam' })).rejects.toThrow();
    expect((await rows()).suggestions[0].status).toBe('denied');
  });
});

describe('decideSuggestion', () => {
  beforeEach(() => seed(db.db, { suggestionRows: [pendingRow()] }));

  it("approves a suggestion onto the wishlist, filed by BGG's section, keeping what BGG says", async () => {
    const lookup = vi.fn(async () => found({ ...WINGSPAN, section: 'coop' }));
    const decided = await decideSuggestion(deps({ lookup }), { id: 'sug-aaaaaa', decision: 'approve' });
    expect(decided).toMatchObject({ item: { status: 'approved', decidedAt: 5000 }, lookup: 'found' });
    const {
      games: [game],
      suggestions: [s],
      info,
    } = await rows();
    expect(game).toMatchObject({
      id: 'sug-aaaaaa',
      name: 'Wingspan',
      status: 'wanted',
      source: 'friend',
      suggestedBy: 'Alex',
      players: '1–5',
      dur: '70 min',
      section: 'coop',
      bggId: 266192,
      image: 'https://cf.geekdo-images.com/w.jpg',
    });
    expect(s.gameId).toBe('sug-aaaaaa');
    expect(info).toEqual([
      {
        bggId: 266192,
        name: 'Wingspan',
        summary: 'Attract birds.',
        honours: WINGSPAN.honours,
        weight: 2.48,
        honoursFrom: null,
        fetchedAt: 5000,
      },
    ]);
  });

  it('approves with no details when BGG finds nothing, saying how the lookup went', async () => {
    const decided = await decideSuggestion(deps({ lookup: async () => ({ outcome: 'no-match' }) }), {
      id: 'sug-aaaaaa',
      decision: 'approve',
    });
    expect(decided.lookup).toBe('no-match');
    const {
      games: [game],
      info,
    } = await rows();
    expect(game).toMatchObject({
      players: null,
      minPlayers: 1,
      maxPlayers: 99,
      minutes: 0,
      section: null,
      bggId: null,
    });
    expect(info).toEqual([]);
  });

  it("uses the details the owner previewed instead of looking up, asking BGG's site for the summary", async () => {
    const lookup = vi.fn(async () => found(WINGSPAN));
    const item = vi.fn(async () => ({ summary: 'Attract birds.', honours: [] }));
    const { bggId, year, min, max, mins, desc, kw, img } = WINGSPAN;
    await decideSuggestion(deps({ lookup, item }), {
      id: 'sug-aaaaaa',
      decision: 'approve',
      game: 'Wingspan',
      details: { bggId, year, min, max, mins, desc, kw, img, section: 'heavy' },
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(item).toHaveBeenCalledWith(266192);
    const {
      games: [game],
      info,
    } = await rows();
    expect(game.section).toBe('heavy');
    expect(info[0]).toMatchObject({ summary: 'Attract birds.', weight: null, fetchedAt: 5000 });
  });

  it("keeps BGG's spelling of a stored id when an add's previewed details bring no answer from BGG", async () => {
    await db.db.insert(bggInfo).values({ bggId: 266192, name: 'Wingspan', honours: [], fetchedAt: 1 });
    const { bggId, min, max, mins, desc, kw } = WINGSPAN;
    await addGame(deps({ item: async () => null }), {
      game: 'wingspan!',
      name: 'Jess',
      details: { bggId, min, max, mins, desc, kw },
    });
    expect((await rows()).info).toMatchObject([{ bggId: 266192, name: 'Wingspan', fetchedAt: 1 }]);
  });

  it("keeps a previewed weight, and BGG's name and extras cut to the table's bounds rather than refusing the game", async () => {
    const item = vi.fn(async () => ({
      name: 'Wingspan (BGG)',
      summary: 'x'.repeat(350),
      honours: [
        ...Array.from({ length: 205 }, (_, i) => ({ name: `Award ${i}`, year: 2000, result: 'Winner' })),
        { name: '', year: 2001, result: 'Nominee' },
      ],
    }));
    const { bggId, min, max, mins, desc, kw } = WINGSPAN;
    await decideSuggestion(deps({ item }), {
      id: 'sug-aaaaaa',
      decision: 'approve',
      details: { bggId, min, max, mins, desc, kw, weight: 2.48 },
    });
    const [info] = (await rows()).info;
    expect(info).toMatchObject({ name: 'Wingspan (BGG)', weight: 2.48 });
    expect(info.summary).toHaveLength(300);
    expect(info.honours).toHaveLength(200);
    const heavy = await refusal(addGame(deps(), { game: 'Azul', name: 'Jess', details: { weight: 9 } }));
    expect([heavy.status, heavy.message]).toEqual([400, 'weight must be from 1 to 5']);
  });

  it('approves without details when the owner sends null, and denies with no lookup', async () => {
    const lookup = vi.fn(async () => found(WINGSPAN));
    await decideSuggestion(deps({ lookup }), { id: 'sug-aaaaaa', decision: 'approve', details: null });
    expect(lookup).not.toHaveBeenCalled();
    await seed(db.db, { suggestionRows: [pendingRow({ id: 'sug-dddddd', gameName: 'Azul' })] });
    expect((await decideSuggestion(deps({ lookup }), { id: 'sug-dddddd', decision: 'deny' })).item?.status).toBe(
      'denied',
    );
    expect(lookup).not.toHaveBeenCalled();
    expect((await rows()).games).toHaveLength(1);
  });

  it('decides an unsent suggestion as a pending one', async () => {
    await db.db.update(suggestions).set({ status: 'unsent' }).where(eq(suggestions.id, 'sug-aaaaaa'));
    expect((await decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'deny' })).item?.status).toBe('denied');
  });

  it('refuses one already decided with a 409 naming what it became, changing nothing', async () => {
    await decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'deny' });
    const err = await refusal(decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'approve' }));
    expect([err.status, err.message, err.extensions]).toMatchObject([
      409,
      'Wingspan was already denied',
      { code: 'ALREADY_DECIDED', status: 'denied' },
    ]);
    expect((await rows()).games).toEqual([]);
  });

  it('decides once when two decisions race, the other refused with what it became', async () => {
    const results = await Promise.allSettled([
      decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'approve', details: null }),
      decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'deny' }),
    ]);
    const settled = results.map((r) => r.status);
    expect(settled.sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { extensions: { code: 'ALREADY_DECIDED' } },
    });
    const { games: g, suggestions: s } = await rows();
    expect(g.length).toBe(s[0].status === 'approved' ? 1 : 0);
  });

  it('refuses a rename onto a game already listed, and a malformed rename or details', async () => {
    await seed(db.db, { gameRows: [curated()] });
    const dup = await refusal(
      decideSuggestion(deps(), {
        id: 'sug-aaaaaa',
        decision: 'approve',
        game: 'seti search for extraterrestrial intelligence',
      }),
    );
    expect([dup.status, dup.message]).toEqual([
      409,
      'SETI: Search for Extraterrestrial Intelligence is already on the list',
    ]);
    expect((await refusal(decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'approve', game: 'x' }))).status).toBe(
      400,
    );
    for (const details of [{ min: 0 }, { img: 'https://example.com/x.jpg' }, { section: 'suggested' }, []]) {
      expect((await refusal(decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'approve', details }))).status).toBe(
        400,
      );
    }
    expect((await rows()).suggestions[0].status).toBe('pending');
  });

  it('answers a malformed id with a 400 and a missing one with a 404', async () => {
    expect((await refusal(decideSuggestion(deps(), { id: 'seti', decision: 'deny' }))).status).toBe(400);
    expect((await refusal(decideSuggestion(deps(), { id: 'sug-zzzzzz', decision: 'deny' }))).status).toBe(404);
  });
});

describe('the emailed pages', () => {
  beforeEach(() => seed(db.db, { suggestionRows: [pendingRow({ note: 'So good' })] }));

  it('read a suggestion, and say why a link is no good', async () => {
    expect(await openEmailed(deps(), 'sug-aaaaaa')).toMatchObject({
      game: 'Wingspan',
      note: 'So good',
      status: 'pending',
    });
    expect((await refusal(openEmailed(deps(), 'Robert'))).message).toBe(
      'This link is incomplete or mistyped. Open it again from the email.',
    );
    expect((await refusal(openEmailed(deps(), 'sug-zzzzzz'))).message).toBe(
      'There is no suggestion behind this link any more.',
    );
  });

  it('preview the friend’s name or a corrected one, and nothing once decided', async () => {
    const lookup = vi.fn(async (name: string) =>
      name === 'Wingspan' ? found(WINGSPAN) : { outcome: 'no-match' as const },
    );
    const item = await openEmailed(deps(), 'sug-aaaaaa');
    expect(await previewEmailed(deps({ lookup }), item, undefined)).toEqual(found(WINGSPAN));
    expect(await previewEmailed(deps({ lookup }), item, '  Wingspan  ')).toEqual(found(WINGSPAN));
    expect((await refusal(previewEmailed(deps({ lookup }), item, 'x'))).extensions).toMatchObject({ code: 'BAD_NAME' });
    expect(await previewEmailed(deps({ lookup }), { ...item, status: 'approved' }, undefined)).toBeNull();
    expect(await previewEmailed(deps(), item, undefined)).toBeNull();
  });
});

describe('pendingList', () => {
  it('lists what waits, unsent included, newest first', async () => {
    await seed(db.db, {
      suggestionRows: [
        pendingRow(),
        pendingRow({ id: 'sug-cccccc', gameName: 'Azul', status: 'unsent', createdAt: 3000 }),
        pendingRow({ id: 'sug-dddddd', gameName: 'Root', status: 'denied', createdAt: 4000, decidedAt: 4500 }),
      ],
    });
    expect((await pendingList(deps())).map((s) => s.game)).toEqual(['Azul', 'Wingspan']);
  });
});

describe('addGame', () => {
  it("puts the owner's game straight on the wishlist, looked up, and refuses one already there", async () => {
    const lookup = vi.fn(async () => found({ ...WINGSPAN, section: 'strategy' }));
    const added = await addGame(deps({ lookup }), { game: 'Wingspan', name: 'Jess', note: 'Ours' });
    expect(added).toMatchObject({ item: { id: 'sug-bbbbbb', status: 'approved', source: 'owner' }, lookup: 'found' });
    const {
      games: [game],
      suggestions: [s],
    } = await rows();
    expect(game).toMatchObject({ source: 'owner', suggestedBy: null, section: 'strategy', createdAt: 5000 });
    expect(s).toMatchObject({ gameId: 'sug-bbbbbb', note: 'Ours' });
    const dup = await refusal(
      addGame(deps({ lookup, randomId: () => 'sug-cccccc' }), { game: 'WINGSPAN', name: 'Jess' }),
    );
    expect([dup.status, dup.message]).toEqual([409, 'Wingspan is already on the list']);
  });

  it('adds with the previewed details, or none, without a lookup', async () => {
    const lookup = vi.fn(async () => found(WINGSPAN));
    await addGame(deps({ lookup }), { game: 'Azul', name: 'Jess', details: null });
    expect(lookup).not.toHaveBeenCalled();
    expect((await rows()).games[0]).toMatchObject({ name: 'Azul', bggId: null, section: null });
  });

  it('adds what a preview answered for a BGG entry past the bounds (999 players, 720 minutes, a soft hyphen)', async () => {
    const crowd = parseThing(
      '<items><item type="boardgame" id="7"><name type="primary" value="Crowd"/><description>Every&#173;one plays.</description><minplayers value="3"/><maxplayers value="999"/><playingtime value="720"/></item></items>',
    )!;
    const previewed = await previewGame(deps({ lookup: async () => found(crowd) }), 'Crowd');
    // Sent back as the client sends it: through JSON, as the add's details.
    const { details } = JSON.parse(JSON.stringify(previewed)) as { details: Record<string, unknown> };
    delete details.name;
    await addGame(deps({ item: async () => null }), { game: 'Crowd', name: 'Jess', details });
    expect((await rows()).games[0]).toMatchObject({
      bggId: 7,
      minPlayers: 3,
      maxPlayers: PLAYERS_MAX,
      minutes: MINS_MAX,
      description: 'Everyone plays.',
    });
  });

  it("holds previewed details to an edit's rules and stores nothing when they fail", async () => {
    const { bggId, year, min, max, mins, desc, kw, img } = WINGSPAN;
    const PREVIEWED = { bggId, year, min, max, mins, desc, kw, img };
    for (const [details, message] of [
      ['nope', 'details must be an object'],
      [[PREVIEWED], 'details must be an object'],
      [{ ...PREVIEWED, min: 5, max: 2 }, 'players must be whole numbers from 1 to 99, min at most max'],
      [{ ...PREVIEWED, kw: ['not-a-real-keyword'] }, 'keywords must be a short list of keyword ids'],
      [{ ...PREVIEWED, bggId: 0 }, 'bggId must be a positive whole number'],
      [{ ...PREVIEWED, bggId: '266192' }, 'bggId must be a positive whole number'],
      [{ ...PREVIEWED, year: 2019.5 }, 'year must be a whole number'],
      [{ ...PREVIEWED, year: 10_000 }, 'year must be a whole number'],
      [{ ...PREVIEWED, img: 'http://insecure.example/x.jpg' }, 'img must be a BoardGameGeek image URL'],
      [
        { ...PREVIEWED, img: `https://cf.geekdo-images.com/${'x'.repeat(500)}` },
        'img must be a BoardGameGeek image URL',
      ],
      [{ ...PREVIEWED, img: 42 }, 'img must be a BoardGameGeek image URL'],
      // Box art comes from BGG's image CDN only, never another https host.
      [{ ...PREVIEWED, img: 'https://evil.example/x.jpg' }, 'img must be a BoardGameGeek image URL'],
      [
        { ...PREVIEWED, img: 'https://cf.geekdo-images.com.evil.example/x.jpg' },
        'img must be a BoardGameGeek image URL',
      ],
    ] as const) {
      const err = await refusal(addGame(deps(), { game: 'Wingspan', name: 'Jess', details }));
      expect([err.status, err.message], JSON.stringify(details).slice(0, 80)).toEqual([400, message]);
      expect(await rows()).toMatchObject({ games: [], suggestions: [] });
    }
  });

  it.each([
    [{ game: 'x', name: 'Jess' }, 400],
    [{ game: 'Azul', name: '!' }, 400],
    [{ game: 'Azul', name: 'Jess', note: '\u0007' }, 400],
    [{ game: 'Azul', name: 'Jess', details: { kw: ['nope'] } }, 400],
  ])('refuses %o', async (input, status) => {
    expect((await refusal(addGame(deps(), input))).status).toBe(status);
  });
});

describe('editGame', () => {
  beforeEach(() => seed(db.db, { gameRows: [curated(), curated({ id: 'azul', name: 'Azul', bggId: 230802 })] }));

  it('edits a game that was written into the site, keeping what the edit leaves out', async () => {
    const edited = await editGame(deps(), {
      id: 'seti',
      game: 'SETI',
      details: { min: 2, desc: 'Search\n the   stars.', kw: ['strategy', 'thematic'], type: 'strategy' },
    });
    expect(edited).toMatchObject({
      name: 'SETI',
      minPlayers: 2,
      maxPlayers: 4,
      players: '2–4',
      minutes: 160,
      dur: '40–160 min',
      description: 'Search the stars.',
      keywords: ['strategy', 'thematic'],
      section: 'strategy',
      note: '',
    });
  });

  it('edits the note of the suggestion a game came from, and refuses one for a written entry', async () => {
    await seed(db.db, { suggestionRows: [pendingRow({ note: 'Old' })] });
    await decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'approve', details: null });
    expect(await editGame(deps(), { id: 'sug-aaaaaa', note: '  Calm   one ' })).toMatchObject({ note: 'Calm one' });
    expect((await editGame(deps(), { id: 'sug-aaaaaa', note: '' })).note).toBe('');
    for (const [input, message] of [
      [{ id: 'seti', note: 'Hers' }, 'only a game suggested on the site has a note'],
      [{ id: 'sug-aaaaaa', note: null }, `note must be at most ${NOTE_MAX} characters`],
      [{ id: 'sug-aaaaaa', note: 'x'.repeat(NOTE_MAX + 1) }, `note must be at most ${NOTE_MAX} characters`],
    ] as const) {
      const err = await refusal(editGame(deps(), input));
      expect([err.status, err.message]).toEqual([400, message]);
    }
  });

  it('files a game under "Suggested by friends" with type null', async () => {
    expect((await editGame(deps(), { id: 'seti', details: { type: null } })).section).toBeNull();
  });

  it.each([
    [{ id: 'seti' }, 400, 'nothing to change'],
    [{ id: 'seti', details: { min: 5, max: 2 } }, 400, 'players must be whole numbers from 1 to 99, min at most max'],
    [{ id: 'seti', details: { mins: 601 } }, 400, 'minutes must be a whole number from 0 to 600'],
    [{ id: 'seti', details: { type: 'suggested' } }, 400, 'unknown wishlist type'],
    [{ id: 'seti', details: 'x' }, 400, 'details must be an object'],
    [{ id: 'seti', game: 'azul' }, 409, 'Azul is already on the list'],
    [{ id: 'Nope!' }, 400, 'invalid id'],
    [{ id: 'nope' }, 404, 'game not found'],
  ])('refuses %o', async (input, status, message) => {
    const err = await refusal(editGame(deps(), input));
    expect([err.status, err.message]).toEqual([status, message]);
  });
});

describe('removeGame', () => {
  it('takes a written game off the wishlist, keeping its row', async () => {
    await seed(db.db, { gameRows: [curated()] });
    await removeGame(deps(), 'seti');
    expect((await rows()).games[0].status).toBe('removed');
    const err = await refusal(removeGame(deps(), 'seti'));
    expect([err.status, err.message]).toEqual([
      409,
      'SETI: Search for Extraterrestrial Intelligence is not on the wishlist',
    ]);
  });

  it('takes the suggestion a game came from with it', async () => {
    await seed(db.db, { suggestionRows: [pendingRow()] });
    await decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'approve', details: null });
    await removeGame(deps({ now: () => 9000 }), 'sug-aaaaaa');
    const [s] = await db.db.select().from(suggestions).where(eq(suggestions.id, 'sug-aaaaaa'));
    expect(s).toMatchObject({ status: 'removed', decidedAt: 9000 });
  });
});

describe('listGames', () => {
  it('answers the wishlist with notes, and every game BGG knows with its honours and the owner’s wins', async () => {
    await seed(db.db, {
      gameRows: [curated(), curated({ id: 'gone', name: 'Gone', status: 'removed' })],
      suggestionRows: [pendingRow()],
    });
    await decideSuggestion(deps(), { id: 'sug-aaaaaa', decision: 'approve', details: null });
    await db.db.update(suggestions).set({ note: 'Lovely' }).where(eq(suggestions.id, 'sug-aaaaaa'));
    const winner = { name: 'Spiel des Jahres', year: 2009, result: 'Winner' };
    await db.db.insert(bggInfo).values([
      { bggId: 36218, name: 'Dominion', honours: [winner], fetchedAt: 1 },
      { bggId: 209418, name: 'Dominion (2nd)', honours: [], honoursFrom: 36218, weight: 2.3, fetchedAt: 1 },
    ]);
    await db.db.insert(ownerAwards).values({ bggId: 209418, name: 'Dice Tower Best Game', year: 2009 });
    const answer = await listGames(deps());
    expect(answer.wishlist.map((g) => [g.id, g.note])).toEqual([
      ['seti', ''],
      ['sug-aaaaaa', 'Lovely'],
    ]);
    await addGame(deps({ now: () => 9000, randomId: () => 'sug-newest' }), {
      game: 'Azul',
      name: 'Jess',
      details: null,
    });
    expect((await listGames(deps())).wishlist.map((g) => g.id)).toEqual(['seti', 'sug-newest', 'sug-aaaaaa']);
    expect(answer.bgg).toEqual([
      { bggId: 36218, name: 'Dominion', summary: null, weight: null, honours: [winner] },
      {
        bggId: 209418,
        name: 'Dominion (2nd)',
        summary: null,
        weight: 2.3,
        honours: [winner, { name: 'Dice Tower Best Game', year: 2009, result: 'Winner' }],
      },
    ]);
  });

  it("shows the owner's awards for an id BGG hasn't been asked about yet, named by its game", async () => {
    await seed(db.db, { gameRows: [curated()] });
    const seti = (await rows()).games[0];
    await db.db.insert(ownerAwards).values([
      { bggId: seti.bggId!, name: 'Dice Tower Game of the Year', year: 2024 },
      { bggId: 77, name: 'Fixture Prize', year: 2010 },
    ]);
    expect((await listGames(deps())).bgg).toEqual([
      {
        bggId: 77,
        name: 'BoardGameGeek 77',
        summary: null,
        weight: null,
        honours: [{ name: 'Fixture Prize', year: 2010, result: 'Winner' }],
      },
      {
        bggId: seti.bggId,
        name: seti.name,
        summary: null,
        weight: null,
        honours: [{ name: 'Dice Tower Game of the Year', year: 2024, result: 'Winner' }],
      },
    ]);
  });
});

describe('BoardGameGeek token problems', () => {
  beforeEach(() => vi.mocked(reportError).mockClear());

  it('reports a missing or refused token by name, never its value, and still answers', async () => {
    expect(await previewGame(deps({ lookup: async () => ({ outcome: 'no-token' }) }), 'Azul')).toEqual({
      outcome: 'no-token',
    });
    expect(String(vi.mocked(reportError).mock.calls[0][1])).toMatch(/BGG_API_TOKEN is not set/);
    await previewGame(deps({ lookup: async () => ({ outcome: 'refused', status: 401 }) }), 'Azul');
    expect(String(vi.mocked(reportError).mock.calls[1][1])).toMatch(/refused BGG_API_TOKEN \(HTTP 401\)/);
  });

  it('turns a throwing lookup into BGG not answering, logged, and a plain miss into nothing reported', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwing = async (): Promise<LookupResult> => {
      throw new Error('boom');
    };
    expect(await previewGame(deps({ lookup: throwing }), 'Azul')).toMatchObject({ outcome: 'unavailable' });
    expect(errSpy).toHaveBeenCalledWith('suggestions: BoardGameGeek lookup failed', expect.any(Error));
    errSpy.mockRestore();
    expect(await previewGame(deps({ lookup: async () => ({ outcome: 'no-match' }) }), 'Azul')).toEqual({
      outcome: 'no-match',
    });
    expect(await previewGame(deps(), 'Azul')).toEqual({ outcome: 'unavailable' });
    expect(reportError).not.toHaveBeenCalled();
    expect((await refusal(previewGame(deps(), 'x'))).status).toBe(400);
  });
});
