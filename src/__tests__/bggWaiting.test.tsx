import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameCard from '../components/GameCard';
import GameRow from '../components/GameRow';
import GameLine from '../components/GameLine';
import { FilterProvider } from '../context/FilterContext';
import { GamesContext } from '../context/gamesContextValue';
import { GAMES } from '../data/games';
import { waitingForBgg } from '../utils/bggInfo';

// A first visit with the games query still out: what BoardGameGeek brings
// shows as grey bars, the game's own line kept unless the owner picked
// BGG's summary for it.
const catan = GAMES.find((g) => g.slug === 'catan')!; // picked (bggSummary)
const azul = GAMES.find((g) => g.slug === 'azul')!; // not picked

function Waiting({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <GamesContext.Provider
        value={{
          wishlist: [],
          bgg: new Map(),
          collection: GAMES,
          comingSoon: [],
          loaded: false,
          failed: false,
          reload: () => {},
        }}
      >
        <FilterProvider>{children}</FilterProvider>
      </GamesContext.Provider>
    </MemoryRouter>
  );
}

const bars = (el: HTMLElement) => el.querySelectorAll('.animate-pulse');

describe('waitingForBgg', () => {
  it('waits for the difficulty of a game with a BGG id or a game inside with one, its awards only on its own id, and the line only of a picked one', () => {
    expect(waitingForBgg(catan, false)).toEqual({ bgg: true, awards: true, summary: true });
    expect(waitingForBgg(azul, false)).toEqual({ bgg: true, awards: true, summary: false });
    expect(waitingForBgg({ bgg: undefined, subgames: [{ ...catan, kind: 'expansion', bgg: 7 }] }, false)).toEqual({
      bgg: true,
      awards: false,
      summary: false,
    });
    expect(waitingForBgg({ bgg: undefined }, false)).toEqual({ bgg: false, awards: false, summary: false });
    expect(waitingForBgg(catan, true)).toEqual({ bgg: false, awards: false, summary: false });
  });
});

describe('a collection game while the games query is out', () => {
  it("on a card, bars the difficulty, the award pill and a picked game's line", () => {
    const { container } = render(
      <Waiting>
        <GameCard game={catan} />
        <GameCard game={azul} />
      </Waiting>,
    );
    const [catanCard, azulCard] = container.querySelectorAll<HTMLElement>('.game-card');
    expect(bars(catanCard)).toHaveLength(3);
    expect(within(catanCard).queryByText(catan.short)).toBeNull();
    expect(bars(azulCard)).toHaveLength(2);
    expect(azulCard).toHaveTextContent(azul.short);
  });

  it("in a list row, bars the difficulty, the award count and a picked game's line", () => {
    const { container } = render(
      <Waiting>
        <table>
          <tbody>
            <GameRow game={catan} isOpen={false} onToggle={() => {}} />
            <GameRow game={azul} isOpen={false} onToggle={() => {}} />
          </tbody>
        </table>
      </Waiting>,
    );
    const [catanRow, azulRow] = container.querySelectorAll<HTMLElement>('tr.game-row');
    // The line and the award count appear twice (beside the name, and in
    // the description column), and the difficulty once.
    expect(bars(catanRow)).toHaveLength(5);
    expect(within(catanRow).queryByText(catan.short, { exact: false })).toBeNull();
    expect(bars(azulRow)).toHaveLength(3);
    expect(within(azulRow).getAllByText(azul.short, { exact: false })).toHaveLength(2);
    expect(within(azulRow).queryByText('Not rated on BoardGameGeek')).toBeNull();
  });

  it("on a phone's line, bars the difficulty word, and a picked game's line in its panel", () => {
    render(
      <Waiting>
        <ul>
          <GameLine game={catan} isOpen={false} onToggle={() => {}} />
          <GameLine game={azul} isOpen={false} onToggle={() => {}} />
        </ul>
      </Waiting>,
    );
    const line = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('li')!;
    expect(bars(line('Catan'))).toHaveLength(2);
    expect(bars(line('Azul'))).toHaveLength(1);
    expect(line('Azul')).toHaveTextContent(azul.short);
  });
});
