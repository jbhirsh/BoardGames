import { describe, it, expect } from 'vitest';
import { revealInStrip } from '../client/revealInStrip';

/**
 * jsdom has no layout, so the strip and its item are plain objects with the
 * few measures the helper reads: a 300px-wide strip at x=10 on the page,
 * scrolled `scroll` px, and an item 100px wide, `at` px into it.
 */
function layout(scroll: number, at: number) {
  const strip = { offsetLeft: 10, clientWidth: 300, scrollLeft: scroll };
  const el = { offsetLeft: 10 + at, offsetWidth: 100 };
  return {
    strip,
    el,
    reveal: (margin?: number) => revealInStrip(strip as unknown as HTMLElement, el as unknown as HTMLElement, margin),
  };
}

describe('revealInStrip', () => {
  it('leaves the strip be when the item already shows whole', () => {
    const { strip, reveal } = layout(100, 150);
    reveal();
    expect(strip.scrollLeft).toBe(100);
  });

  it('scrolls back to an item cut off at the start, flush with the edge', () => {
    const { strip, reveal } = layout(200, 150);
    reveal();
    expect(strip.scrollLeft).toBe(150);
  });

  it('scrolls on to an item cut off at the end, flush with the edge', () => {
    // The item ends at 450; a 300px strip shows it whole from 150.
    const { strip, reveal } = layout(0, 350);
    reveal();
    expect(strip.scrollLeft).toBe(150);
  });

  it('keeps the item the margin clear of either edge', () => {
    const start = layout(160, 200);
    start.reveal(48);
    expect(start.strip.scrollLeft).toBe(152);

    const end = layout(0, 200);
    end.reveal(48);
    expect(end.strip.scrollLeft).toBe(48);

    // Within the margin of neither edge: left alone.
    const clear = layout(100, 150);
    clear.reveal(48);
    expect(clear.strip.scrollLeft).toBe(100);
  });

  it("never scrolls before the strip's start for an item near it", () => {
    const { strip, reveal } = layout(30, 20);
    reveal(48);
    expect(strip.scrollLeft).toBe(0);
  });
});
