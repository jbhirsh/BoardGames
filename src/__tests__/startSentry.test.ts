import { describe, it, expect, vi } from 'vitest';

const sentry = vi.hoisted(() => ({ startSentry: vi.fn() }));
vi.mock('../client/sentry', () => sentry);

describe('startSentry', () => {
  it('starts error reporting as it loads', async () => {
    await import('../startSentry');
    expect(sentry.startSentry).toHaveBeenCalledExactlyOnceWith();
  });
});
