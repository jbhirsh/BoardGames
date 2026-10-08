import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// A role query over a full page (the wishlist's 39 cards) takes 300-500ms
// in jsdom, so waitFor/findBy's default 1s left room for one or two tries
// and a slower CI runner timed out before the awaited state could show.
configure({ asyncUtilTimeout: 3000 })

// ResizeObserver is not available in jsdom
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
