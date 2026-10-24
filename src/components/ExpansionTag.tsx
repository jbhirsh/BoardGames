import { ALL_GAMES } from '../data/games';
import { labelPillClass } from './sharedClasses';

const OWNED = new Set(ALL_GAMES.map((g) => g.name));

/**
 * Marks a wishlist entry that adds to another game, so nobody votes for it
 * thinking it plays on its own: "Expansion for Catan (owned)" when the base
 * game is in the collection. The entry's `expands` names the base game; the
 * data test (wishlistData.test.ts) checks each names a game we have or want.
 */
export default function ExpansionTag({ base, wrap = false }: { base: string; wrap?: boolean }) {
  return (
    // In a list row's badges (`wrap`) it may wrap, its corners squarer.
    <span className={`${labelPillClass} ${wrap ? 'rounded-control whitespace-normal' : 'rounded-[999px]'}`}>
      Expansion for {base}
      {OWNED.has(base) && <span className="text-dark"> (owned)</span>}
    </span>
  );
}
