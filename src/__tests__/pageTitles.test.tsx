import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import RulesPage from '../components/RulesPage';
import WordCheckerPage from '../components/WordCheckerPage';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';
import NotFoundPage from '../components/NotFoundPage';

// React 19 hoists a <title> rendered anywhere into <head>, so each page names
// its own browser tab.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rules/:slug/:part?" element={<RulesPage />} />
        <Route path="/score/:slug" element={<ScoreCalculatorPage />} />
        <Route path="/word-checker" element={<WordCheckerPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('page titles', () => {
  it('names a rulebook tab after its book', () => {
    renderAt('/rules/catan');
    expect(document.title).toBe('Catan rules · The Game Room');
  });

  it('names an add-on tab after the add-on', () => {
    renderAt('/rules/catan/cities-and-knights');
    expect(document.title).toMatch(/^Cities & Knights.* rules · The Game Room$/);
  });

  it('says when the game is unknown', () => {
    renderAt('/rules/nope');
    expect(document.title).toBe('Game not found · The Game Room');
  });

  it('names the score calculator and the word checker', () => {
    const { unmount } = renderAt('/score/7-wonders');
    expect(document.title).toBe('7 Wonders score · The Game Room');
    unmount();
    renderAt('/word-checker');
    expect(document.title).toBe('Word Checker · The Game Room');
  });

  it('says an unknown address is not found', () => {
    renderAt('/nowhere');
    expect(document.title).toBe('Page not found · The Game Room');
  });
});
