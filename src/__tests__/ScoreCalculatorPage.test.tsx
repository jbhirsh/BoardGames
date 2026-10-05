import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';

function renderPage(path = '/score/7-wonders') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/score/:slug" element={<ScoreCalculatorPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ScoreCalculatorPage', () => {
  // The page saves the game in progress; each test starts from a fresh one.
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('shows the not-found page for a game with no score calculator', () => {
    // Catan is in the collection but has no calculator: the slug must decide
    // the page, not fall back to 7 Wonders.
    renderPage('/score/catan');
    expect(screen.getByRole('heading', { level: 1, name: 'No score calculator' })).toBeInTheDocument();
    expect(screen.getByText(/There's no score calculator for that game/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the collection' })).toHaveAttribute('href', '/');
    expect(screen.queryByText('Score Calculator')).not.toBeInTheDocument();
    expect(screen.queryByText('7 Wonders')).not.toBeInTheDocument();
  });

  it('shows the not-found page for a slug that is no game at all', () => {
    renderPage('/score/not-a-game');
    expect(screen.getByRole('heading', { level: 1, name: 'No score calculator' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Player 1' })).not.toBeInTheDocument();
  });

  it('renders the score calculator title and 7 Wonders name', () => {
    renderPage();
    expect(screen.getByText('Score Calculator')).toBeInTheDocument();
    expect(screen.getByText('7 Wonders')).toBeInTheDocument();
  });

  it('starts with two players and a Results tab', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Player 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Player 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Results' })).toBeInTheDocument();
  });

  it('updates total when civilian score is entered', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '12' } });
    expect(screen.getByText('12 VP')).toBeInTheDocument();
  });

  it('adds a third player via the Add player button', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    expect(screen.getByRole('button', { name: 'Player 3' })).toBeInTheDocument();
  });

  it('removes a player via the per-tab remove button', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Player 3' }));
    expect(screen.queryByRole('button', { name: 'Player 3' })).not.toBeInTheDocument();
  });

  it('does not show remove buttons when only two players remain', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Remove Player 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Player 2' })).not.toBeInTheDocument();
  });

  it('renames a player via the name input', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Player Name'), { target: { value: 'Alice' } });
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
  });

  it('computes science VP using the sets-plus-squares formula', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('tablets'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('compasses'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('gears'), { target: { value: '2' } });
    // 2^2 + 2^2 + 2^2 + 7*min(2,2,2) = 4+4+4+14 = 26
    expect(screen.getByText('= 26 VP')).toBeInTheDocument();
    expect(screen.getByText('26 VP')).toBeInTheDocument();
  });

  it('shows treasury VP note only when coins > 0', () => {
    renderPage();
    const treasuryLabel = screen.getByLabelText(/Treasury/).closest('.sc-row');
    expect(treasuryLabel).not.toBeNull();
    expect(within(treasuryLabel as HTMLElement).queryByText(/= \d+ VP/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Treasury/), { target: { value: '9' } });
    expect(within(treasuryLabel as HTMLElement).getByText('= 3 VP')).toBeInTheDocument();
  });

  it('clamps non-military fields to 0 minimum', () => {
    renderPage();
    const civilian = screen.getByLabelText(/Civilian/) as HTMLInputElement;
    fireEvent.change(civilian, { target: { value: '-5' } });
    expect(civilian.value).toBe('0');
  });

  it('allows negative military scores', () => {
    renderPage();
    const military = screen.getByLabelText(/Military/) as HTMLInputElement;
    fireEvent.change(military, { target: { value: '-3' } });
    expect(military.value).toBe('-3');
  });

  it('shows the results summary ranked by total VP', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Player 2' }));
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));

    const winner = screen.getByText('👑').closest('.sc-summary-row');
    expect(winner).not.toBeNull();
    expect(within(winner as HTMLElement).getByText('Player 2')).toBeInTheDocument();
    expect(within(winner as HTMLElement).getByText('25 VP')).toBeInTheDocument();
  });

  it('returns to a player tab from the results view', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(screen.queryByLabelText('Player Name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Player 1' }));
    expect(screen.getByLabelText('Player Name')).toBeInTheDocument();
  });

  // Typing "-" then "2" in a real browser is covered by e2e/score.spec.ts;
  // jsdom can't hold a half-typed number.
  it('counts a negative military score against the total', () => {
    renderPage();
    const military = screen.getByLabelText(/Military/) as HTMLInputElement;
    fireEvent.change(military, { target: { value: '-2' } });
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '7' } });
    expect(military.value).toBe('-2');
    expect(screen.getByText('5 VP')).toBeInTheDocument();
  });

  it('flips the military sign with the plus-minus button', () => {
    renderPage();
    const military = screen.getByLabelText(/Military/) as HTMLInputElement;
    fireEvent.change(military, { target: { value: '3' } });
    const flip = screen.getByRole('button', { name: /Switch military sign/ });
    fireEvent.click(flip);
    expect(military.value).toBe('-3');
    fireEvent.click(flip);
    expect(military.value).toBe('3');
  });

  it('disables the sign toggle until there is a military score to flip', () => {
    renderPage();
    const flip = screen.getByRole('button', { name: /Switch military sign/ });
    expect(flip).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Military/), { target: { value: '4' } });
    expect(flip).toBeEnabled();
  });

  it('starts fields empty and drops a leading zero', () => {
    renderPage();
    const civilian = screen.getByLabelText(/Civilian/) as HTMLInputElement;
    expect(civilian.value).toBe('');
    fireEvent.change(civilian, { target: { value: '07' } });
    expect(civilian.value).toBe('7');
  });

  it('lets a field be cleared, counting it as zero', () => {
    renderPage();
    const civilian = screen.getByLabelText(/Civilian/) as HTMLInputElement;
    fireEvent.change(civilian, { target: { value: '12' } });
    fireEvent.change(civilian, { target: { value: '' } });
    expect(civilian.value).toBe('');
    expect(screen.getByText('0 VP')).toBeInTheDocument();
  });

  it('restores the game in progress after a reload', () => {
    const { unmount } = renderPage();
    fireEvent.change(screen.getByLabelText('Player Name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/Military/), { target: { value: '-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Player 2' }));
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '9' } });
    unmount();

    renderPage();
    expect(screen.getByLabelText(/Civilian/)).toHaveValue(9);
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    expect(screen.getByLabelText(/Military/)).toHaveValue(-2);
  });

  it('starts fresh when the saved game is unreadable', () => {
    localStorage.setItem('gameroom:score:7-wonders', '{"players":[{"id":1}],"active":0}');
    renderPage();
    expect(screen.getByRole('button', { name: 'Player 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Player 2' })).toBeInTheDocument();
  });

  it('starts fresh when the saved game repeats a player id', () => {
    const player = { id: 3, name: 'Ann', military: '', coins: '', wonder: '', civilian: '5', tablets: '', compasses: '', gears: '', commercial: '', guilds: '' };
    localStorage.setItem('gameroom:score:7-wonders', JSON.stringify({ players: [player, { ...player, name: 'Bo' }], active: 0 }));
    renderPage();
    expect(screen.getByRole('button', { name: 'Player 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ann' })).not.toBeInTheDocument();
  });

  it('starts fresh when the saved game is not JSON', () => {
    localStorage.setItem('gameroom:score:7-wonders', 'not json');
    renderPage();
    expect(screen.getByRole('button', { name: 'Player 1' })).toBeInTheDocument();
  });

  it('asks before removing a player who has scores', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Player 3' }));
    expect(confirm).toHaveBeenCalledWith('Remove Player 3 and their scores?');
    expect(screen.getByRole('button', { name: 'Player 3' })).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Player 3' }));
    expect(screen.queryByRole('button', { name: 'Player 3' })).not.toBeInTheDocument();
  });

  it('removes a player with no scores without asking', () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Player 3' }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('starts a new game after confirming', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add player' }));
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Player 3' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Civilian/)).toHaveValue(null);
  });

  it('keeps the scores when a new game is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    fireEvent.change(screen.getByLabelText(/Civilian/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(screen.getByLabelText(/Civilian/)).toHaveValue(4);
  });

  it('highlights only the Results tab while results are showing', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(screen.getByRole('button', { name: 'Player 1' })).not.toHaveClass('active');
    expect(screen.getByRole('button', { name: 'Results' })).toHaveClass('active');
  });
});
