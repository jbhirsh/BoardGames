import type { Filterable } from '../data/types';
import { useGames } from '../context/useGames';
import { difficultyOf } from '../utils/difficulty';
import { GaugeIcon } from './Icons';
import { metaClass } from './sharedClasses';

/** A grey bar where a value waits for the games query, pulsing as the routes' fallback does. */
export function WaitingBar({ className = 'w-16' }: { className?: string }) {
  return <span className={`inline-block h-3 animate-pulse rounded-sm bg-bg2 ${className}`} aria-hidden="true" />;
}

/**
 * How hard a game is to learn, beside its players and time on a card or in
 * a list of the games inside one: "Medium · 2.3". A grey bar while the games
 * query, which brings BoardGameGeek's weight, is still out on a first visit;
 * nothing when it isn't known.
 */
export default function DifficultyMeta({ item }: { item: Pick<Filterable, 'weight' | 'subgames' | 'bgg'> }) {
  const { loaded } = useGames();
  const label = difficultyOf(item);
  if (!label && !loaded && (item.bgg !== undefined || item.subgames?.some((s) => s.bgg !== undefined))) {
    return <WaitingBar />;
  }
  if (!label) return null;
  return (
    <span className={metaClass}>
      <GaugeIcon /> <span className="sr-only">Difficulty: </span>
      {label}
    </span>
  );
}
