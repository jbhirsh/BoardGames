// Query.games: the wishlist and what BoardGameGeek says about every game the
// site knows (#290's part 2b). The collection is still compiled into the
// app (src/data/games.ts) until part 4, so it takes its awards, difficulty
// and, for the games the owner picked, BGG's summary from this answer, by
// BGG id, as the wishlist does.
//
// A game's honours are its BGG id's, or those of the id `honours_from`
// names (a later edition with none of its own shows the original's), plus
// the wins the owner confirmed that BGG doesn't list (`owner_awards`),
// which count as wins.
//
// The answer is the same for every caller, signed in or not, so it can be
// served over GET and kept by the service worker; it reads no session.
// Deliberately no rate limit: it's one read with no write, and a per-IP
// counter would add a database write to every page load.

import { bggInfo, ownerAwards } from '../_db/schema.js';
import type { Honour } from '../_lib/bgg.js';
import { wishlist, type SuggestionsDeps, type WishlistGame } from './suggestions.js';

interface BggView {
  bggId: number;
  name: string;
  summary: string | null;
  weight: number | null;
  honours: Honour[];
}

export interface GamesAnswer {
  wishlist: WishlistGame[];
  bgg: BggView[];
}

export async function listGames(deps: Pick<SuggestionsDeps, 'db'>): Promise<GamesAnswer> {
  const db = await deps.db();
  const [wanted, infos, awards] = await Promise.all([
    wishlist(deps),
    db.select().from(bggInfo),
    db.select().from(ownerAwards),
  ]);
  const honoursOf = new Map(infos.map((i) => [i.bggId, i.honours]));
  const owned = new Map<number, Honour[]>();
  for (const a of awards) {
    owned.set(a.bggId, [...(owned.get(a.bggId) ?? []), { name: a.name, year: a.year, result: 'Winner' }]);
  }
  const bgg: BggView[] = infos.map((i) => ({
    bggId: i.bggId,
    name: i.name,
    summary: i.summary,
    weight: i.weight,
    honours: [
      ...(i.honoursFrom == null ? i.honours : (honoursOf.get(i.honoursFrom) ?? [])),
      ...(owned.get(i.bggId) ?? []),
    ],
  }));
  // The owner's awards show even for an id BGG hasn't been asked about yet
  // (its row comes with the next production build's refresh).
  const listed = new Set(infos.map((i) => i.bggId));
  for (const [bggId, honours] of owned) {
    if (listed.has(bggId)) continue;
    const named = wanted.find((g) => g.bggId === bggId);
    bgg.push({ bggId, name: named?.name ?? `BoardGameGeek ${bggId}`, summary: null, weight: null, honours });
  }
  bgg.sort((a, b) => a.bggId - b.bggId);
  return { wishlist: wanted, bgg };
}
