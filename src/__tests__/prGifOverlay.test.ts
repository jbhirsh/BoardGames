import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_SCRIPT } from '../../scripts/pr-gif-overlay.ts';

// scripts/pr-gif-overlay.ts as it runs in the page: once, in this file's
// jsdom window. Here rather than beside it, for the DOM's types, which the
// scripts' own config (Node) hasn't.
// jsdom has no layout, so boxes are stubbed where the label is placed.
type Win = typeof window & { __prGifMoves: { x: number; y: number; t: number }[]; __prGifClip?: unknown };
const win = window as Win;
const part = (name: string) => document.querySelector<HTMLElement>(`[data-pr-gif="${name}"]`)!;
const frames = () => vi.advanceTimersByTime(40);

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'Date'] });
  // As if the page before had the pointer here.
  sessionStorage.setItem('prGif:pointer', JSON.stringify({ x: 7, y: 9 }));
  new Function(OVERLAY_SCRIPT)();
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
  vi.advanceTimersByTime(2000);
  delete win.__prGifClip;
});

describe('the pointer', () => {
  it('draws a layer the page can\'t click', () => {
    expect(part('layer').style.pointerEvents).toBe('none');
  });

  it('starts where the pointer was on the page before, and keeps where it goes for the next', () => {
    expect(part('arrow').style.left).toBe('7px');
    expect(part('arrow').style.top).toBe('9px');
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 70 }));
    expect(JSON.parse(sessionStorage.getItem('prGif:pointer')!)).toEqual({ x: 60, y: 70 });
  });

  it('follows each move, and keeps a log of them', () => {
    win.__prGifMoves.length = 0;
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 80 }));
    expect(part('arrow').style.left).toBe('120px');
    expect(part('arrow').style.top).toBe('80px');
    expect(win.__prGifMoves).toEqual([{ x: 120, y: 80, t: Date.now() }]);
  });

  it('shows a ring while pressed, and trails a drag', () => {
    window.dispatchEvent(new MouseEvent('pointerdown'));
    expect(part('ring').style.opacity).toBe('1');
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 130, clientY: 80 }));
    expect(document.querySelectorAll('[data-pr-gif="trail"]')).toHaveLength(1);
    window.dispatchEvent(new MouseEvent('pointerup'));
    expect(part('ring').style.opacity).toBe('0');
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 80 }));
    expect(document.querySelectorAll('[data-pr-gif="trail"]')).toHaveLength(1);
    vi.advanceTimersByTime(700);
    expect(document.querySelectorAll('[data-pr-gif="trail"]')).toHaveLength(0);
  });

  it('points a wheel turn the way the page scrolls, then fades it', () => {
    for (const [deltaX, deltaY, arrow] of [[0, 100, '↓'], [0, -100, '↑'], [100, 0, '→'], [-100, 0, '←']] as const) {
      window.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY }));
      expect(part('wheel').textContent).toBe(arrow);
      expect(part('wheel').style.opacity).toBe('1');
    }
    vi.advanceTimersByTime(400);
    expect(part('wheel').style.opacity).toBe('0');
  });
});

describe('the ticks', () => {
  type Ticks = { t: number; moving: boolean }[];
  const ticks = () => (window as unknown as { __prGifTicks: Ticks }).__prGifTicks;
  const box = (left: number, top: number) => ({ left, top, right: left + 10, bottom: top + 10, width: 10, height: 10 });

  it('note nothing until recording starts', () => {
    ticks().length = 0;
    frames();
    expect(ticks()).toEqual([]);
  });

  it('note each frame while recording, moving after the pointer, a key or the wheel, still otherwise', () => {
    win.__prGifClip = { x: 0, y: 0, width: 400, height: 300 };
    frames();
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }));
    vi.advanceTimersByTime(16);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    vi.advanceTimersByTime(16);
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    vi.advanceTimersByTime(16);
    vi.advanceTimersByTime(16);
    expect(ticks().slice(-4).map((k) => k.moving)).toEqual([true, true, true, false]);
    expect(ticks().every((k, i) => i === 0 || k.t >= ticks()[i - 1].t)).toBe(true);
  });

  it('count an animation running in the recorded area as moving, not a paused one or one out of shot', () => {
    win.__prGifClip = { x: 0, y: 0, width: 400, height: 300 };
    const at = (el: Partial<HTMLElement>, playState: string) => ({ playState, effect: { target: el } });
    const inShot = { getBoundingClientRect: () => box(100, 100) } as unknown as HTMLElement;
    const outOfShot = { getBoundingClientRect: () => box(100, 900) } as unknown as HTMLElement;
    const doc = document as unknown as { getAnimations?: () => unknown[] };
    const cases: [unknown[], boolean][] = [
      [[at(inShot, 'running')], true],
      [[at(inShot, 'paused')], false],
      [[at(outOfShot, 'running')], false],
      [[], false],
    ];
    try {
      for (const [animations, moving] of cases) {
        doc.getAnimations = () => animations;
        vi.advanceTimersByTime(16);
        expect(ticks().at(-1)!.moving).toBe(moving);
      }
    } finally {
      delete doc.getAnimations;
    }
  });
});

describe('a key press', () => {
  // A focusable button whose box is `box`.
  function focusOn(box: { left: number; top: number; width: number; height: number }) {
    const button = document.createElement('button');
    document.body.prepend(button);
    button.getBoundingClientRect = () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON: () => box });
    button.focus();
    return button;
  }
  const press = (key: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
  const label = () => part('key');

  it('is labelled under what has focus, a frame after the key', () => {
    focusOn({ left: 300, top: 100, width: 100, height: 40 });
    press('Tab');
    expect(label().style.opacity).not.toBe('1');
    frames();
    expect(label().textContent).toBe('Tab');
    expect(label().style.opacity).toBe('1');
    expect(label().style.left).toBe('350px');
    expect(label().style.top).toBe('148px');
    vi.advanceTimersByTime(600);
    expect(label().style.opacity).toBe('0');
  });

  it('goes over what has focus when under it would leave the recorded area, and stays inside it', () => {
    win.__prGifClip = { x: 0, y: 50, width: 400, height: 100 };
    focusOn({ left: 380, top: 100, width: 100, height: 40 });
    press('Enter');
    frames();
    expect(label().textContent).toBe('Enter');
    expect(label().style.top).toBe('92px');
    expect(label().style.left).toBe('396px');
  });

  it('sits at the bottom of the recorded area with nothing focused', () => {
    (document.activeElement as HTMLElement).blur();
    win.__prGifClip = { x: 0, y: 50, width: 400, height: 110 };
    press('Escape');
    frames();
    expect(label().textContent).toBe('Esc');
    expect(label().style.top).toBe('148px');
    expect(label().style.left).toBe('200px');
  });

  it('sits at the bottom of the recorded area, not on its edge, when what has focus is out of shot', () => {
    win.__prGifClip = { x: 0, y: 50, width: 400, height: 110 };
    focusOn({ left: -3000, top: 100, width: 100, height: 40 });
    press('ArrowRight');
    frames();
    expect(label().textContent).toBe('→');
    expect(label().style.left).toBe('200px');
    expect(label().style.top).toBe('148px');
  });

  it('builds up characters typed one after another, spaces and all, into one label', () => {
    for (const key of ['c', 'a', 't', ' ', 'm']) {
      press(key);
      frames();
    }
    expect(label().textContent).toBe('cat m');
    vi.advanceTimersByTime(600);
    press('d');
    frames();
    expect(label().textContent).toBe('d');
  });

  it('names a shortcut or a space on its own, and nothing for a modifier on its own', () => {
    press('k', { ctrlKey: true });
    frames();
    expect(label().textContent).toBe('Ctrl+K');
    vi.advanceTimersByTime(600);
    press(' ');
    frames();
    expect(label().textContent).toBe('Space');
    press('Shift', { shiftKey: true });
    frames();
    expect(label().textContent).toBe('Space');
  });
});
