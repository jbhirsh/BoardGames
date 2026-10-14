import { describe, it, expect } from 'vitest';
import { durationCategory } from '../utils/duration';

describe('durationCategory', () => {
  it('buckets play times: quick up to 15 min, medium up to an hour, long beyond', () => {
    expect([10, 15, 16, 45, 60, 61, 480].map(durationCategory))
      .toEqual(['quick', 'quick', 'medium', 'medium', 'medium', 'long', 'long']);
  });
});
