import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { games, suggestions } from '../../../api/_db/schema';

// Rows the API tests start from, written straight into a test database.

type GameRow = typeof games.$inferInsert;
type SuggestionRow = typeof suggestions.$inferInsert;

/** A game on the wishlist, written into the site's code before 2b (a curated row), with `over` changed. */
export const curated = (over: Partial<GameRow> = {}): GameRow => ({
  id: 'seti',
  name: 'SETI: Search for Extraterrestrial Intelligence',
  status: 'wanted',
  source: 'curated',
  players: '1–4',
  minPlayers: 1,
  maxPlayers: 4,
  dur: '40–160 min',
  minutes: 160,
  description: 'Search the stars.',
  keywords: ['strategy'],
  section: 'heavy',
  video: 'how to play SETI',
  image: '/images/wishlist/seti.jpg',
  bggId: 418059,
  ...over,
});

/** A friend's waiting suggestion, with `over` changed. */
export const pendingRow = (over: Partial<SuggestionRow> = {}): SuggestionRow => ({
  id: 'sug-aaaaaa',
  gameName: 'Wingspan',
  name: 'Alex',
  note: '',
  status: 'pending',
  source: 'friend',
  createdAt: 1000,
  ...over,
});

export async function seed(
  db: LibSQLDatabase,
  { gameRows = [], suggestionRows = [] }: { gameRows?: GameRow[]; suggestionRows?: SuggestionRow[] },
): Promise<void> {
  if (gameRows.length) await db.insert(games).values(gameRows);
  if (suggestionRows.length) await db.insert(suggestions).values(suggestionRows);
}
