declare module '@vitest/expect' {
  interface Assertion {
    toHaveNoViolations(): void;
  }
}

export {};
