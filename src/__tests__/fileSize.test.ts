import { describe, it, expect } from 'vitest';
import { formatSize } from '../utils/fileSize';

describe('formatSize', () => {
  it('gives megabytes to one decimal place', () => {
    expect(formatSize(16_445_120)).toBe('16.4 MB');
    expect(formatSize(1_000_000)).toBe('1 MB');
  });

  it('gives whole kilobytes below a megabyte, never 0 KB', () => {
    expect(formatSize(850_400)).toBe('850 KB');
    expect(formatSize(12)).toBe('1 KB');
  });
});
