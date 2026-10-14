import type { DurationCategory } from '../data/types';

/**
 * The bucket a play time falls in, which colours a list row's time pill:
 * quick up to 15 minutes, medium up to an hour, long beyond. Worked out
 * from `mins` wherever it is shown rather than typed beside it, so the
 * two can't disagree.
 */
export function durationCategory(mins: number): DurationCategory {
  return mins <= 15 ? 'quick' : mins <= 60 ? 'medium' : 'long';
}
