// @vitest-environment node
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The module keeps one instance's state (whether it has served a request,
// when it finished loading), so each test loads a fresh copy, as a new
// instance would.
let timing: typeof import('../../api/_lib/timing');

beforeEach(async () => {
  vi.resetModules();
  timing = await import('../../api/_lib/timing');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('timeRequest and phase', () => {
  it('records each phase of a request, in the order each ended', async () => {
    const said = await timing.timeRequest(async (read) => {
      await timing.phase('outer', async () => {
        await timing.phase('inner', () => 'done');
      });
      timing.phaseSync('sync', () => 1);
      return read();
    });
    expect(said.phases.map((p) => p.name)).toEqual(['inner', 'outer', 'sync']);
    expect(said.phases.every((p) => p.ms >= 0)).toBe(true);
  });

  it("passes a phase's result and error through, and still records it", async () => {
    const said = await timing.timeRequest(async (read) => {
      expect(await timing.phase('ok', () => 42)).toBe(42);
      await expect(timing.phase('fails', () => Promise.reject(new Error('no')))).rejects.toThrow('no');
      expect(() =>
        timing.phaseSync('throws', () => {
          throw new Error('sync');
        }),
      ).toThrow('sync');
      return read();
    });
    expect(said.phases.map((p) => p.name)).toEqual(['ok', 'fails', 'throws']);
  });

  it('only runs the work outside a request', async () => {
    expect(await timing.phase('loose', () => 'x')).toBe('x');
    const said = await timing.timeRequest(async (read) => read());
    expect(said.phases).toEqual([]);
  });

  it('keeps concurrent requests apart', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const a = timing.timeRequest(async (read) => {
      await timing.phase('a', () => gate);
      return read();
    });
    const b = timing.timeRequest(async (read) => {
      await timing.phase('b', () => 'b');
      return read();
    });
    release();
    expect((await a).phases.map((p) => p.name)).toEqual(['a']);
    expect((await b).phases.map((p) => p.name)).toEqual(['b']);
  });

  it("marks only the instance's first request cold, with the time loading took", async () => {
    timing.markLoaded(123.4);
    timing.markLoaded(999);
    const first = await timing.timeRequest(async (read) => read());
    const second = await timing.timeRequest(async (read) => read());
    expect(first).toMatchObject({ cold: true, loadedMs: 123.4 });
    expect(second.cold).toBe(false);
    expect(second).not.toHaveProperty('loadedMs');
  });

  it("records when each phase started, in ms from the request's start", async () => {
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const said = await timing.timeRequest(async (read) => {
      now = 110;
      await timing.phase('outer', async () => {
        now = 115;
        await timing.phase('inner', () => {
          now = 120;
        });
        now = 130;
      });
      now = 140;
      timing.phaseSync('sync', () => {
        now = 145;
      });
      return read();
    });
    expect(said.phases).toEqual([
      { name: 'inner', ms: 5, startMs: 15 },
      { name: 'outer', ms: 20, startMs: 10 },
      { name: 'sync', ms: 5, startMs: 40 },
    ]);
    expect(said.totalMs).toBe(45);
    expect(timing.serverTimingHeader(said)).toBe(
      'cold, inner;dur=5;start=15, outer;dur=20;start=10, sync;dur=5;start=40, total;dur=45',
    );
  });

  it('reads the phases recorded by the time it is asked', async () => {
    await timing.timeRequest(async (read) => {
      await timing.phase('before', () => undefined);
      const early = read();
      await timing.phase('after', () => undefined);
      expect(early.phases.map((p) => p.name)).toEqual(['before', 'after']);
      expect(read().totalMs).toBeGreaterThanOrEqual(early.totalMs);
    });
  });
});

describe('serverTimingHeader', () => {
  it('writes cold and loaded first, then each phase, then the total', () => {
    expect(
      timing.serverTimingHeader({
        cold: true,
        loadedMs: 812.345,
        phases: [
          { name: 'deps', ms: 1.26 },
          { name: 'db-open', ms: 40 },
        ],
        fields: [],
        totalMs: 60.04,
      }),
    ).toBe('cold, loaded;dur=812.3, deps;dur=1.3, db-open;dur=40, total;dur=60');
  });

  it('writes a warm request as its phases and total only', () => {
    expect(timing.serverTimingHeader({ cold: false, phases: [], fields: [], totalMs: 0.04 })).toBe('total;dur=0');
  });

  it('turns a name into a token, and a duration that is not a positive number into 0', () => {
    expect(timing.metricName('db open/check')).toBe('db-open-check');
    expect(timing.metricName('')).toBe('-');
    expect(timing.durationText(Number.NaN)).toBe('0');
    expect(timing.durationText(-5)).toBe('0');
    expect(timing.durationText(Number.POSITIVE_INFINITY)).toBe('0');
  });
});
