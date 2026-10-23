import { describe, it, expect } from 'vitest';
import { radioMove } from '../utils/radioMove';

describe('radioMove', () => {
  it('steps forward with Down and Right, wrapping past the last', () => {
    expect(radioMove('ArrowDown', 0, 3)).toBe(1);
    expect(radioMove('ArrowRight', 1, 3)).toBe(2);
    expect(radioMove('ArrowDown', 2, 3)).toBe(0);
    expect(radioMove('ArrowRight', 2, 3)).toBe(0);
  });

  it('steps back with Up and Left, wrapping before the first', () => {
    expect(radioMove('ArrowUp', 2, 3)).toBe(1);
    expect(radioMove('ArrowLeft', 1, 3)).toBe(0);
    expect(radioMove('ArrowUp', 0, 3)).toBe(2);
    expect(radioMove('ArrowLeft', 0, 3)).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(radioMove('Home', 2, 4)).toBe(0);
    expect(radioMove('End', 0, 4)).toBe(3);
  });

  it("is null for a key that doesn't move, an inherited name included", () => {
    expect(radioMove('Enter', 1, 3)).toBeNull();
    expect(radioMove('Tab', 1, 3)).toBeNull();
    expect(radioMove('toString', 1, 3)).toBeNull();
  });
});
