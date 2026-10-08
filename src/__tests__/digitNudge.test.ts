import { describe, it, expect } from 'vitest';
import { digitNudge } from '../utils/digitNudge';

describe('digitNudge', () => {
  it('moves digits down by how far their middle sits above the line\'s', () => {
    // A 17px line with its baseline 13px down: 12px digits span 1-13, middle
    // 7, against the line's 8.5.
    expect(digitNudge({ height: 17, baseline: 13, capHeight: 12 })).toBe(1.5);
  });

  it('moves them up when a font rides them low, and leaves a centred font alone', () => {
    expect(digitNudge({ height: 20, baseline: 17, capHeight: 12 })).toBe(-1);
    expect(digitNudge({ height: 20, baseline: 16, capHeight: 12 })).toBe(0);
  });

  it('keeps the exact offset, fractions and all, so the digits land dead centre', () => {
    expect(digitNudge({ height: 17, baseline: 13.2, capHeight: 11.6 })).toBeCloseTo(1.1);
    expect(digitNudge({ height: 17, baseline: 12.8, capHeight: 12 })).toBeCloseTo(1.7);
  });

  it('keeps within 4px either way', () => {
    expect(digitNudge({ height: 40, baseline: 12, capHeight: 10 })).toBe(4);
    expect(digitNudge({ height: 10, baseline: 30, capHeight: 10 })).toBe(-4);
  });

  it('gives 0 when the layout reports no cap height', () => {
    expect(digitNudge({ height: 0, baseline: 0, capHeight: 0 })).toBe(0);
    expect(digitNudge({ height: 17, baseline: 13, capHeight: NaN })).toBe(0);
  });
});
