import 'vitest';
import type { AxeResults } from 'axe-core';

declare module 'vitest' {
  interface Matchers<R, T> {
    // Only callable on axe-core's results, so the matcher can't be pointed
    // at a value it would crash on.
    toHaveNoViolations: [T] extends [AxeResults] ? () => R : never;
  }
}
