import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';
import App, { HomePage } from '../App';
import WordCheckerPage from '../components/WordCheckerPage';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';

expect.extend(matchers);

// color-contrast needs real layout, which jsdom does not compute; skip it.
const axeOptions = { rules: { 'color-contrast': { enabled: false } } };

// axe on a full page in jsdom is slow on GitHub Actions runners — default
// 5s can flake, and a timeout here cascades because vitest-axe's axe
// singleton then reports "Axe is already running" for the next test.
const TIMEOUT_MS = 30_000;

describe('accessibility', () => {
  it('home page has no axe violations', async () => {
    const router = createMemoryRouter([
      { element: <App />, children: [{ path: '/', element: <HomePage /> }] },
    ]);
    const { container } = render(<RouterProvider router={router} />);
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('word checker page has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <WordCheckerPage />
      </MemoryRouter>
    );
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);

  it('score calculator page has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <ScoreCalculatorPage />
      </MemoryRouter>
    );
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  }, TIMEOUT_MS);
});
