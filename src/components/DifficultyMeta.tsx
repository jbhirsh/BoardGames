import type { Filterable } from '../data/types';
import { difficultyOf } from '../utils/difficulty';
import { GaugeIcon } from './Icons';

/**
 * How hard a game is to learn, beside its players and time on a card or in
 * a list of the games inside one: "Medium · 2.3". Nothing when that isn't
 * known.
 */
export default function DifficultyMeta({ item }: { item: Pick<Filterable, 'weight' | 'subgames'> }) {
  const label = difficultyOf(item);
  if (!label) return null;
  return (
    <span className="cmeta">
      <GaugeIcon /> <span className="sr-only">Difficulty: </span>{label}
    </span>
  );
}
