import { GAMES } from '../data/games';

const OWNED = new Set(GAMES.map((g) => g.name));

/**
 * Marks a wishlist entry that adds to another game, so nobody votes for it
 * thinking it plays on its own: "Expansion for Catan (owned)" when the base
 * game is in the collection.
 */
export default function ExpansionTag({ base }: { base: string }) {
  return (
    <span className="expands-tag">
      Expansion for {base}{OWNED.has(base) && <span className="expands-owned"> (owned)</span>}
    </span>
  );
}
