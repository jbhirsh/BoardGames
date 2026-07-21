import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import RulesPage from '../components/RulesPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/rules/:slug" element={<RulesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RulesPage', () => {
  it('shows a not-found message when the slug matches no game', () => {
    // Guards the `if (!game)` branch and the GAMES.find lookup: an unknown slug
    // must render the not-found view, and only an unknown slug.
    renderAt('/rules/does-not-exist');
    expect(screen.getByText('Game not found')).toBeInTheDocument();
  });

  it('renders the game for a known slug and no Word Checker button for non-word games', () => {
    // Kills the inverse of the not-found branch (a real game must NOT be treated
    // as missing) and the `game.slug === 'bananagrams'` guard on the Word Checker
    // button (7 Wonders is not a word game, so the button must be absent).
    renderAt('/rules/7-wonders');
    expect(screen.getByRole('heading', { name: '7 Wonders' })).toBeInTheDocument();
    expect(screen.queryByText('Game not found')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Word Checker' })).not.toBeInTheDocument();
  });

  it('toggles the Word Checker panel on and off for bananagrams', () => {
    // Kills the bananagrams-only render of the toggle button, the toggle event
    // handler, and the `wordCheckerOpen && <WordChecker />` conditional render.
    renderAt('/rules/bananagrams');
    expect(screen.queryByPlaceholderText('Enter a word...')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Word Checker' }));
    expect(screen.getByPlaceholderText('Enter a word...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Word Checker' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Word Checker' }));
    expect(screen.queryByPlaceholderText('Enter a word...')).not.toBeInTheDocument();
  });
});
