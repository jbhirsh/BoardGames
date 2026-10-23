import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import ScoreCalculatorPage from '../components/ScoreCalculatorPage';

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/score/:slug/:part?" element={<ScoreCalculatorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const box = (name: string | RegExp) => screen.getByRole('spinbutton', { name });
const type = (name: string | RegExp, value: string) => fireEvent.change(box(name), { target: { value } });
const click = (name: string | RegExp, within_?: HTMLElement) =>
  fireEvent.click((within_ ? within(within_) : screen).getByRole('button', { name }));
const group = (name: string) => screen.getByRole('group', { name });
const sheetRow = (name: string) =>
  within(screen.getByRole('table')).getAllByRole('row').find((r) => within(r).queryByRole('rowheader', { name }))!;
const cells = (name: string) => within(sheetRow(name)).getAllByRole('cell').map((c) => c.textContent);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('ScoreCalculatorPage picks the pad', () => {
  it.each([
    ['/score/catan/cities-and-knights', 'a real add-on with no pad'],
    ['/score/7-wonders/extra', 'a pad\'s game with a part it hasn\'t'],
  ])('shows the not-found page for %s (%s)', (path) => {
    renderPage(path);
    expect(screen.getByRole('heading', { level: 1, name: 'No score calculator' })).toBeInTheDocument();
  });
});

describe('Ticket to Ride', () => {
  it('turns routes by length into points, adds tickets made, takes off tickets missed', () => {
    renderPage('/score/ticket-to-ride');
    type(/3-train routes/, '2');
    type(/6-train routes/, '1');
    expect(screen.getByText('= 23 points', { selector: 'span' })).toBeInTheDocument();
    click('+ Add ticket');
    type('Ticket 1 points', '12');
    click('+ Add ticket');
    type('Ticket 2 points', '8');
    click('Missed', group('Ticket 2'));
    expect(screen.getByText('27 points')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Longest Continuous Path/ }));
    expect(screen.getByText('37 points')).toBeInTheDocument();
    click('Remove ticket 2');
    expect(screen.getByText('45 points')).toBeInTheDocument();
  });

  it('names a box\'s unit in the singular for one', () => {
    renderPage('/score/ticket-to-ride');
    type(/1-train route\b/, '1');
    expect(document.getElementById('sc-route-1-unit')).toHaveTextContent('route');
    expect(document.getElementById('sc-route-1-unit')).not.toHaveTextContent('routes');
  });

  it('scores Europe\'s 8-train routes and stations, and its own bonus', () => {
    renderPage('/score/ticket-to-ride');
    expect(screen.queryByRole('spinbutton', { name: /8-train/ })).not.toBeInTheDocument();
    click('Europe');
    expect(screen.queryByRole('spinbutton', { name: /5-train/ })).not.toBeInTheDocument();
    type(/8-train/, '1');
    type(/Stations kept/, '7');
    expect(box(/Stations kept/)).toHaveValue(3);
    expect(screen.getByText('33 points')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /European Express/ })).toBeInTheDocument();
  });

  it('keeps the map with the game, and ranks the table with the rulebook\'s tie-breaks', () => {
    const { unmount } = renderPage('/score/ticket-to-ride');
    click('Europe');
    type(/4-train/, '1');
    click('+ Add ticket');
    type('Ticket 1 points', '5');
    click('Next: Player 2');
    type(/6-train/, '1');
    click('+ Add ticket');
    type('Ticket 1 points', '3');
    click('Missed', group('Ticket 1'));
    type(/Stations kept/, '1');
    unmount();

    renderPage('/score/ticket-to-ride');
    expect(screen.getByRole('button', { name: 'Europe' })).toHaveAttribute('aria-pressed', 'true');
    click('Results');
    expect(cells('Routes')).toEqual(['7', '15']);
    expect(cells('Tickets missed')).toEqual(['0', '−3']);
    expect(cells('Stations')).toEqual(['0', '4']);
    expect(cells('Total')).toEqual(['12', '16']);
    expect(cells('Place')).toEqual(['2nd', '1st']);
  });

  it('says how a tie on points was broken', () => {
    renderPage('/score/ticket-to-ride');
    click('+ Add ticket');
    type('Ticket 1 points', '4');
    click('Next: Player 2');
    type(/3-train/, '1');
    click('Results');
    expect(screen.getByText('Player 1 and Player 2 tie on 4 points, broken on tickets completed: Player 1 1, Player 2 0.')).toBeInTheDocument();
    expect(cells('Place')).toEqual(['1st', '2nd']);
  });

  it('crowns nobody before anyone has scored', () => {
    renderPage('/score/ticket-to-ride');
    click('Results');
    expect(cells('Place')).toEqual(['–', '–']);
  });

  it('starts fresh when a saved player isn\'t one it wrote, and ignores a map it doesn\'t know', () => {
    localStorage.setItem('gameroom:score:ticket-to-ride', JSON.stringify({ players: [{ id: 0, name: 'Ann', routes: {}, tickets: [], longest: false, stations: '' }, { id: 1, name: 'Bo' }], active: 0 }));
    localStorage.setItem('gameroom:score:ticket-to-ride:map', '"mars"');
    renderPage('/score/ticket-to-ride');
    expect(screen.queryByRole('button', { name: 'Ann' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'United States' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a saved map that isn\'t JSON', () => {
    localStorage.setItem('gameroom:score:ticket-to-ride:map', 'europe');
    renderPage('/score/ticket-to-ride');
    expect(screen.getByRole('button', { name: 'United States' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Dominion', () => {
  it('counts the base cards, and the Kingdom cards only once ticked', () => {
    renderPage('/score/dominion');
    type(/Provinces/, '4');
    type(/Duchies/, '3');
    type(/Curses/, '2');
    expect(screen.getByText('31 VP')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /Duke/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Duke' }));
    type(/Duke/, '2');
    expect(screen.getByText('37 VP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Gardens' }));
    type(/^Gardens/, '1');
    type(/Cards in your deck/, '42');
    expect(screen.getByText('41 VP')).toBeInTheDocument();
    // Unticked, a card scores nothing again, though its count stays.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Duke' }));
    expect(screen.getByText('35 VP')).toBeInTheDocument();
  });

  it('lists the ticked Kingdom cards on the sheet, and says how a tie is settled', () => {
    renderPage('/score/dominion');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Nobles' }));
    type(/Nobles/, '1');
    click('Next: Player 2');
    type(/Estates/, '2');
    click('See results');
    expect(cells('Nobles')).toEqual(['2', '0']);
    expect(cells('Curses')).toEqual(['0', '0']);
    expect(screen.queryByRole('rowheader', { name: 'Mill' })).not.toBeInTheDocument();
    expect(screen.getByText('Player 1 and Player 2 tie on 2 VP, so they share 1st place.')).toBeInTheDocument();
    expect(screen.getByText(/fewer turns/)).toBeInTheDocument();
  });

  it('clears the Kingdom with the scores on New game', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage('/score/dominion');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mill' }));
    type(/Mill/, '3');
    click('New game');
    expect(screen.getByRole('checkbox', { name: 'Mill' })).not.toBeChecked();
    expect(screen.getByText('0 VP')).toBeInTheDocument();
  });

  it('keeps the Kingdom across a reload, but not one it doesn\'t know', () => {
    localStorage.setItem('gameroom:score:dominion:kingdom', '["mill","witch"]');
    const { unmount } = renderPage('/score/dominion');
    expect(screen.getByRole('checkbox', { name: 'Mill' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Harem (Farm)' }));
    unmount();
    renderPage('/score/dominion');
    expect(screen.getByRole('checkbox', { name: 'Harem (Farm)' })).toBeChecked();
  });
});
