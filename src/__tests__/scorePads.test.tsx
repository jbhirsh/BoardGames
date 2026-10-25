import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, createMemoryRouter, RouterProvider } from 'react-router';
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
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .find((r) => within(r).queryByRole('rowheader', { name }))!;
const cells = (name: string) =>
  within(sheetRow(name))
    .getAllByRole('cell')
    .map((c) => c.textContent);

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('ScoreCalculatorPage picks the pad', () => {
  it("opens a game inside a deck at its own address, under the deck's art", () => {
    renderPage('/score/card-deck/hearts');
    expect(screen.getByRole('heading', { level: 1, name: 'Score Calculator' })).toBeInTheDocument();
    expect(screen.getByText('Hearts')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Card Deck box art' })).toBeInTheDocument();
    expect(document.title).toBe('Hearts score · The Game Room');
  });

  it.each([
    ['/score/card-deck', 'a deck has no pad of its own'],
    ['/score/card-deck/spoons', "a deck's game with no pad"],
    ['/score/card-deck/not-a-game', 'no such game in the deck'],
    ['/score/catan/cities-and-knights', 'a real add-on with no pad'],
    ['/score/7-wonders/extra', "a pad's game with a part it hasn't"],
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

  it('asks for each ticket until one is added, and presses Made or Missed for each', () => {
    renderPage('/score/ticket-to-ride');
    const hint = 'Add each ticket you kept, with the points printed on it.';
    expect(screen.getByText(hint)).toBeInTheDocument();
    click('+ Add ticket');
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    const made = within(group('Ticket 1')).getByRole('button', { name: 'Made' });
    const missed = within(group('Ticket 1')).getByRole('button', { name: 'Missed' });
    expect(made).toHaveAttribute('aria-pressed', 'true');
    expect(missed).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(missed);
    expect(made).toHaveAttribute('aria-pressed', 'false');
    expect(missed).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(made);
    expect(made).toHaveAttribute('aria-pressed', 'true');
    expect(missed).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'United States' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Europe' })).toHaveAttribute('aria-pressed', 'false');
  });

  it("names a box's unit in the singular for one", () => {
    renderPage('/score/ticket-to-ride');
    type(/1-train route\b/, '1');
    expect(document.getElementById('sc-route-1-unit')).toHaveTextContent('route');
    expect(document.getElementById('sc-route-1-unit')).not.toHaveTextContent('routes');
  });

  it("scores Europe's 8-train routes and stations, and its own bonus", () => {
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

  it("keeps the map with the game, and ranks the table with the rulebook's tie-breaks", () => {
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
    // Player 1 never touched their stations: all three kept.
    expect(cells('Stations')).toEqual(['12', '4']);
    expect(cells('Total')).toEqual(['24', '16']);
    expect(cells('Place')).toEqual(['1st', '2nd']);
  });

  it('says how a tie on points was broken', () => {
    renderPage('/score/ticket-to-ride');
    click('+ Add ticket');
    type('Ticket 1 points', '4');
    click('Next: Player 2');
    type(/3-train/, '1');
    click('Results');
    expect(
      screen.getByText('Player 1 and Player 2 tie on 4 points, broken on tickets completed: Player 1 1, Player 2 0.'),
    ).toBeInTheDocument();
    expect(cells('Place')).toEqual(['1st', '2nd']);
  });

  it("crowns nobody before anyone has scored, Europe's kept stations aside", () => {
    renderPage('/score/ticket-to-ride');
    click('Europe');
    expect(box(/Stations kept/)).toHaveValue(3);
    expect(screen.getByText('12 points')).toBeInTheDocument();
    click('Results');
    expect(cells('Place')).toEqual(['–', '–']);
  });

  it("opens on Europe from Europe's rules tab, whatever was played last", () => {
    localStorage.setItem('gameroom:score:ticket-to-ride:map', '"usa"');
    renderPage('/score/ticket-to-ride?map=europe');
    expect(screen.getByRole('button', { name: 'Europe' })).toHaveAttribute('aria-pressed', 'true');
  });

  it("starts fresh when a saved player isn't one it wrote, and ignores a map it doesn't know", () => {
    localStorage.setItem(
      'gameroom:score:ticket-to-ride',
      JSON.stringify({
        players: [
          { id: 0, name: 'Ann', routes: {}, tickets: [], longest: false, stations: '' },
          { id: 1, name: 'Bo' },
        ],
        active: 0,
      }),
    );
    localStorage.setItem('gameroom:score:ticket-to-ride:map', '"mars"');
    renderPage('/score/ticket-to-ride');
    expect(screen.queryByRole('button', { name: 'Ann' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'United States' })).toHaveAttribute('aria-pressed', 'true');
  });

  it("ignores a saved map that isn't JSON", () => {
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
    expect(
      screen.getByText(
        'Player 1 and Player 2 tie on 2 VP, so they share 1st place, unless one of them had fewer turns.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^A tie on points goes to the player who had fewer turns/)).toBeInTheDocument();
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

  it("keeps the Kingdom across a reload, but not one it doesn't know", () => {
    localStorage.setItem('gameroom:score:dominion:kingdom', '["mill","witch"]');
    const { unmount } = renderPage('/score/dominion');
    expect(screen.getByRole('checkbox', { name: 'Mill' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Harem (Farm)' }));
    unmount();
    renderPage('/score/dominion');
    expect(screen.getByRole('checkbox', { name: 'Harem (Farm)' })).toBeChecked();
  });
});

describe('the round-by-round pad', () => {
  it('scores Uno: who went out takes the points left in the other hands', () => {
    renderPage('/score/uno');
    expect(screen.getByRole('status')).toHaveTextContent('First to 500 wins.');
    const add = screen.getByRole('button', { name: 'Add round 1' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('Choose who went out.');
    click('Player 2', group('Who went out?'));
    expect(screen.queryByRole('spinbutton', { name: 'Player 2' })).not.toBeInTheDocument();
    type('Player 1', '40');
    expect(screen.getByText('Player 1 0 · Player 2 +40')).toBeInTheDocument();
    click('Add round 1');
    expect(
      within(screen.getByRole('region', { name: 'Standings' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Player 10', 'Player 240']);
    expect(cells('Total')).toEqual(['0', '40']);
    expect(screen.getByRole('heading', { name: 'Round 2' })).toBeInTheDocument();
    expect(screen.getByText('Round 1 added.')).toBeInTheDocument();
  });

  it('folds the players away once a round is in, and crowns the leader in the standings', () => {
    const { container } = renderPage('/score/uno');
    const players = container.querySelector('details')!;
    expect(players).toHaveAttribute('open');
    expect(screen.queryByText(/Partners sit opposite/)).not.toBeInTheDocument();
    click('Player 2', group('Who went out?'));
    type('Player 1', '40');
    click('Add round 1');
    expect(players).not.toHaveAttribute('open');
    const [first, second] = within(screen.getByRole('region', { name: 'Standings' })).getAllByRole('listitem');
    expect(second).toHaveClass('sc-win');
    expect(second.querySelector('svg')).not.toBeNull();
    expect(first).not.toHaveClass('sc-win');
    expect(first.querySelector('svg')).toBeNull();
  });

  it("marks the round being fixed on the sheet, and says where Spades' partners sit", () => {
    renderPage('/score/card-deck/golf');
    type('Player 1', '4');
    type('Player 2', '5');
    click('Add hole 1');
    type('Player 1', '3');
    type('Player 2', '2');
    click('Add hole 2');
    const row = (n: number) => screen.getByRole('button', { name: `Fix hole ${n}` }).closest('tr')!;
    expect(row(1).querySelector('td')).not.toHaveClass('bg-blue-bg');
    click('Fix hole 1');
    expect(row(1).querySelector('td')).toHaveClass('bg-blue-bg');
    expect(row(1).querySelector('th')).toHaveClass('bg-blue-bg');
    expect(row(2).querySelector('td')).not.toHaveClass('bg-blue-bg');
    expect(row(2).querySelector('th')).not.toHaveClass('bg-blue-bg');
    renderPage('/score/card-deck/spades');
    expect(screen.getByText('Partners sit opposite: players 1 and 3 against 2 and 4.')).toBeInTheDocument();
  });

  it('adds and removes players only before the first round, and names them', () => {
    renderPage('/score/card-deck/rummy');
    click('+ Add player');
    fireEvent.change(screen.getByLabelText('Player 3 name'), { target: { value: 'Cy' } });
    click('Remove Player 2');
    expect(screen.getAllByRole('textbox').map((t) => (t as HTMLInputElement).value)).toEqual(['Player 1', 'Cy']);
    click('Cy', group('Who went out?'));
    click('Add hand 1');
    expect(screen.queryByRole('button', { name: '+ Add player' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.getByText(/before the first hand/)).toBeInTheDocument();
  });

  it("scores Hearts, warning when a hand doesn't add up to 26 but taking it anyway", () => {
    renderPage('/score/card-deck/hearts');
    expect(screen.getByRole('button', { name: 'Add hand 1' })).toBeDisabled();
    // Part-way in, a short hand is only progress.
    type('Player 1', '10');
    type('Player 2', '5');
    expect(screen.getByText("15 of the hand's 26 points so far.")).toBeInTheDocument();
    expect(screen.queryByText(/These add up to/)).not.toBeInTheDocument();
    // Every box in, or past 26 already, it's a warning.
    type('Player 3', '3');
    expect(screen.getByText(/These add up to 18/)).toBeInTheDocument();
    expect(screen.queryByText(/so far/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add hand 1' })).toBeEnabled();
    type('Player 3', '');
    type('Player 2', '25');
    expect(screen.getByText(/These add up to 35/)).toBeInTheDocument();
    type('Player 2', '5');
    type('Player 3', '11');
    expect(screen.queryByText(/These add up to|so far/)).not.toBeInTheDocument();
    click('Add hand 1');
    click('Player 3', group('Did anyone shoot the moon?'));
    expect(screen.getByText('Player 3 scores 0 and everyone else 26.')).toBeInTheDocument();
    click('Add hand 2');
    expect(cells('Total')).toEqual(['36', '31', '11']);
    expect(screen.getByRole('status')).toHaveTextContent('First to 100; then the lowest score wins.');
  });

  it("asks whether a hand all in one player's hands was a moon shot", () => {
    renderPage('/score/card-deck/hearts');
    type('Player 2', '26');
    expect(screen.getByText(/One player took all 26: did they shoot the moon\?/)).toBeInTheDocument();
    click('Player 2', group('Did anyone shoot the moon?'));
    expect(screen.queryByText(/One player took all 26/)).not.toBeInTheDocument();
  });

  it('ends Hearts when someone reaches 100, crowning the lowest', () => {
    localStorage.setItem(
      'gameroom:score:hearts',
      JSON.stringify({
        names: ['Ana', 'Ben', 'Cy'],
        rounds: [
          { game: 'hearts', moon: null, taken: [26, 0, 0] },
          { game: 'hearts', moon: null, taken: [26, 0, 0] },
          { game: 'hearts', moon: null, taken: [26, 0, 0] },
        ],
      }),
    );
    renderPage('/score/card-deck/hearts');
    type('Ana', '26');
    click('Add hand 4');
    expect(screen.getByRole('status')).toHaveTextContent('Ben and Cy tie for the win on 0.');
    // Over: the form gives way to New game, though a hand can still be fixed.
    expect(screen.queryByRole('heading', { name: 'Hand 5' })).not.toBeInTheDocument();
    click('Fix hand 2');
    expect(screen.getByRole('heading', { name: 'Fix hand 2' })).toBeInTheDocument();
  });

  it('fixes and deletes a round, asking before deleting', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage('/score/card-deck/golf');
    expect(screen.getByRole('button', { name: 'Add hole 1' })).toHaveAccessibleDescription(
      "Enter every player's score, 0 included.",
    );
    type('Player 1', '4');
    click("± Switch Player 1's sign");
    type('Player 2', '12');
    click('Add hole 1');
    type('Player 1', '3');
    type('Player 2', '0');
    click('Add hole 2');
    expect(cells('Total')).toEqual(['−1', '12']);
    expect(screen.getByRole('status')).toHaveTextContent('9 holes; the lowest total wins. 2 of 9 played.');

    click('Fix hole 1');
    expect(screen.getByRole('heading', { name: 'Fix hole 1' })).toHaveFocus();
    expect(box('Player 1')).toHaveValue(-4);
    type('Player 2', '10');
    click('Save');
    expect(cells('Total')).toEqual(['−1', '10']);

    click('Fix hole 2');
    click('Cancel');
    expect(screen.getByRole('heading', { name: 'Hole 3' })).toBeInTheDocument();

    click('Fix hole 1');
    click('Delete');
    expect(confirm).toHaveBeenCalledWith('Delete hole 1?');
    expect(cells('Total')).toEqual(['3', '0']);
    expect(screen.getByText('Hole 1 deleted.')).toBeInTheDocument();
  });

  it('keeps a Golf hole between -99 and 99', () => {
    renderPage('/score/card-deck/golf');
    type('Player 1', '-999999');
    type('Player 2', '999');
    expect(box('Player 1')).toHaveValue(-99);
    expect(box('Player 2')).toHaveValue(99);
  });

  it('labels a seat whose name was cleared by its number', () => {
    renderPage('/score/uno');
    fireEvent.change(screen.getByLabelText('Player 1 name'), { target: { value: ' ' } });
    click('Player 2', group('Who went out?'));
    expect(box('Player 1')).toBeInTheDocument();
    expect(within(group('Who went out?')).getByRole('button', { name: 'Player 1' })).toBeInTheDocument();
    expect(screen.getByLabelText('Player 1 name')).toHaveValue(' ');
  });

  it("keeps each card game's table to itself when Back and Forward move between them", async () => {
    localStorage.setItem(
      'gameroom:score:hearts',
      JSON.stringify({ names: ['Ana', 'Ben', 'Cy'], rounds: [{ game: 'hearts', moon: null, taken: [26, 0, 0] }] }),
    );
    const router = createMemoryRouter([{ path: '/score/:slug/:part?', element: <ScoreCalculatorPage /> }], {
      initialEntries: ['/score/card-deck/hearts'],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByLabelText('Player 1 name')).toHaveValue('Ana');
    await act(async () => {
      await router.navigate('/score/card-deck/golf');
    });
    expect(screen.getByLabelText('Player 1 name')).toHaveValue('Player 1');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('gameroom:score:golf')!)).toEqual({
      names: ['Player 1', 'Player 2'],
      rounds: [],
    });
    expect((JSON.parse(localStorage.getItem('gameroom:score:hearts')!) as { names: string[] }).names).toEqual([
      'Ana',
      'Ben',
      'Cy',
    ]);
  });

  it('keeps a round when its deletion is declined', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage('/score/card-deck/golf');
    type('Player 1', '1');
    type('Player 2', '2');
    click('Add hole 1');
    click('Fix hole 1');
    click('Delete');
    expect(cells('Total')).toEqual(['1', '2']);
  });

  it('ends Golf after nine holes', () => {
    localStorage.setItem(
      'gameroom:score:golf',
      JSON.stringify({
        names: ['Ana', 'Ben'],
        rounds: Array.from({ length: 8 }, () => ({ game: 'golf', scores: [3, 4] })),
      }),
    );
    renderPage('/score/card-deck/golf');
    type('Ana', '10');
    type('Ben', '0');
    click('Add hole 9');
    expect(screen.getByRole('status')).toHaveTextContent('Ben wins on 32.');
  });

  it('scores Spades by partnership, partners sitting opposite, with bags carried', () => {
    renderPage('/score/card-deck/spades');
    expect(screen.getByText('Partners sit opposite: players 1 and 3 against 2 and 4.')).toBeInTheDocument();
    const bids = [3, 4, 2, 0];
    const tricks = [4, 5, 2, 2];
    bids.forEach((b, i) => type(`Player ${i + 1} bid`, String(b)));
    tricks.forEach((t, i) => type(`Player ${i + 1} tricks`, String(t)));
    // Players 1 and 3 bid 5 and take 6: 51 and a bag. Player 2 bids 4 and
    // takes 5 (41, a bag); player 4's nil fails (-100), its 2 tricks bags
    // that score nothing.
    expect(screen.getByText('Player 1 & Player 3 +51 · Player 2 & Player 4 −59')).toBeInTheDocument();
    click('Add hand 1');
    const [us, them] = within(screen.getByRole('region', { name: 'Standings' })).getAllByRole('listitem');
    expect(within(us).getByText('51')).toBeInTheDocument();
    expect(within(us).getByText('1 bag')).toBeInTheDocument();
    expect(within(them).getByText('−59')).toBeInTheDocument();
    expect(within(them).getByText('3 bags')).toBeInTheDocument();
  });

  it("warns when a Spades hand's tricks aren't 13, and needs every box", () => {
    renderPage('/score/card-deck/spades');
    [1, 2, 3].forEach((i) => type(`Player ${i} bid`, '3'));
    expect(screen.getByRole('button', { name: 'Add hand 1' })).toBeDisabled();
    type('Player 4 bid', '3');
    [1, 2, 3, 4].forEach((i) => type(`Player ${i} tricks`, '3'));
    expect(screen.getByText('The tricks add up to 12. A hand has 13.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add hand 1' })).toBeEnabled();
  });

  it('scores Euchre for the makers, renaming the partnerships', () => {
    renderPage('/score/card-deck/euchre');
    fireEvent.change(screen.getByLabelText('Partnership 1 name'), { target: { value: 'Us' } });
    expect(screen.getByRole('button', { name: 'Add hand 1' })).toHaveAccessibleDescription('Choose who chose trump.');
    click('Us', group('Who chose trump?'));
    expect(screen.getByRole('button', { name: 'Add hand 1' })).toHaveAccessibleDescription(
      'Choose how many tricks they took.',
    );
    click('5', group('Tricks they took'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'One of them went alone' }));
    click('Add hand 1');
    click('Team 2', group('Who chose trump?'));
    click('2', group('Tricks they took'));
    click('Add hand 2');
    expect(cells('Total')).toEqual(['6', '0']);
  });

  it('starts a new game with the same players, asking first', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderPage('/score/card-deck/euchre');
    click('Team 1', group('Who chose trump?'));
    click('3', group('Tricks they took'));
    click('Add hand 1');
    click('New game');
    expect(cells('Total')).toEqual(['1', '0']);
    click('New game');
    expect(confirm).toHaveBeenLastCalledWith('Clear every round and start a new game? The players stay.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('New game started.')).toBeInTheDocument();
  });

  it("starts a new game without asking when nothing is scored yet, or from the finished game's button", () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    localStorage.setItem(
      'gameroom:score:euchre',
      JSON.stringify({
        names: ['Us', 'Them'],
        rounds: Array.from({ length: 5 }, () => ({ game: 'euchre', makers: 0, tricks: 5, alone: false })),
      }),
    );
    renderPage('/score/card-deck/euchre');
    expect(screen.getByRole('status')).toHaveTextContent('Us wins on 10.');
    click('New game', screen.getByRole('region', { name: 'Standings' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Hand 1' })).toBeInTheDocument();
    click('New game');
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("restores the game in progress, and starts fresh from anything it didn't write", () => {
    const { unmount } = renderPage('/score/card-deck/rummy');
    click('Player 1', group('Who went out?'));
    type('Player 2', '17');
    click('Add hand 1');
    unmount();
    const again = renderPage('/score/card-deck/rummy');
    expect(cells('Total')).toEqual(['17', '0']);
    again.unmount();

    for (const saved of [
      'not json',
      '7',
      JSON.stringify({ names: ['Solo'], rounds: [] }),
      JSON.stringify({ names: ['A', 'B'], rounds: [{ game: 'uno', out: 0, hands: [0, 1] }] }),
      JSON.stringify({ names: ['A', 3], rounds: [] }),
      JSON.stringify({ names: ['A', 'B'], rounds: 'none' }),
    ]) {
      localStorage.setItem('gameroom:score:rummy', saved);
      const { unmount: done } = renderPage('/score/card-deck/rummy');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Player 1 name')).toHaveValue('Player 1');
      done();
    }
  });

  it('loads a saved Hearts moon and an Uno round back into the form to fix', () => {
    localStorage.setItem(
      'gameroom:score:hearts',
      JSON.stringify({ names: ['A', 'B', 'C'], rounds: [{ game: 'hearts', moon: 1, taken: [0, 0, 0] }] }),
    );
    const { unmount } = renderPage('/score/card-deck/hearts');
    click('Fix hand 1');
    expect(within(group('Did anyone shoot the moon?')).getByRole('button', { name: 'B' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    unmount();
    localStorage.setItem(
      'gameroom:score:uno',
      JSON.stringify({ names: ['A', 'B'], rounds: [{ game: 'uno', out: 1, hands: [33, 0] }] }),
    );
    renderPage('/score/uno');
    click('Fix round 1');
    expect(box('A')).toHaveValue(33);
    expect(within(group('Who went out?')).getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
  });
});
