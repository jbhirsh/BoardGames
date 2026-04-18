import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <ScoreCalculatorPage />
    </MemoryRouter>
  );
}

describe('ScoreCalculatorPage', () => {
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
});
