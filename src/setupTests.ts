import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { vi } from 'vitest';

// A role query over a full page (the wishlist's 39 cards) takes 300-500ms
// in jsdom, so waitFor/findBy's default 1s left room for one or two tries
// and a slower CI runner timed out before the awaited state could show.
configure({ asyncUtilTimeout: 3000 });

// ResizeObserver is not available in jsdom
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// IntersectionObserver is not available in jsdom either; tests that need
// its callbacks stub their own.
globalThis.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

// jsdom does no layout, so its window.scrollTo only logs "Not implemented"
// (about ninety times a run, burying real warnings). A no-op mock instead;
// the tests that check a scroll spy on it or replace it, as before. Not in
// the files that run in Node, which have no window.
if (typeof window !== 'undefined') window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// The games query (context/GamesContext.tsx), which every page asks once:
// answered by default with the seed's wishlist (data/seed.json), as the API
// would, so a page renders its wishlist without each test stubbing it. Any
// other request fails as an unstubbed one did; a test stubs its own fetch
// over this one. Not in the files that run in Node, whose fakes are their own.
if (typeof window !== 'undefined') {
  const { graphqlFetch } = await import('./__tests__/helpers/graphqlFetch');
  const { gamesAnswer } = await import('./__tests__/helpers/wishlist');
  globalThis.fetch = graphqlFetch({ Games: () => gamesAnswer() });
}
