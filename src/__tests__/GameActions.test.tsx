import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import GameActions from '../components/GameActions';
import { FilterProvider } from '../context/FilterContext';
import { quickGame, bananagramsGame, sevenWondersGame } from './testData';
import type { Game } from '../data/types';
import { renderRouted } from './routed';

function renderActions(game: Game, variant: 'card' | 'row', onOuter = vi.fn()) {
  // The row's click handler stands in for the list row the bar sits in.
  const router = renderRouted(
    <FilterProvider>
      <table>
        <tbody>
          <tr onClick={onOuter}>
            <td data-testid="cell">
              <GameActions game={game} variant={variant} />
            </td>
          </tr>
        </tbody>
      </table>
    </FilterProvider>,
  );
  const bar = screen.getByTestId('cell').firstElementChild as HTMLElement;
  const names = () =>
    within(bar)
      .getAllByRole('link')
      .map((a) => a.getAttribute('aria-label') ?? a.textContent!.trim());
  return { router, bar, names, onOuter };
}

describe('GameActions', () => {
  it.each(['card', 'row'] as const)(
    "on a %s, puts Rules first, then the game's own tools, then its video",
    (variant) => {
      expect(renderActions(sevenWondersGame, variant).names()).toEqual([
        'Rules for 7 Wonders',
        'Score',
        'Watch 7 Wonders tutorial on YouTube',
      ]);
    },
  );

  it('offers the word checker on its game only', () => {
    expect(renderActions(bananagramsGame, 'card').names()).toEqual([
      'Rules for Bananagrams',
      'Word Checker',
      'Watch Bananagrams tutorial on YouTube',
    ]);
  });

  it('offers only Rules and the video to a game with no tools', () => {
    expect(renderActions(quickGame, 'row').names()).toEqual([
      'Rules for Quick Game',
      'Watch Quick Game tutorial on YouTube',
    ]);
  });

  it("sits in the card's footer, its links with tooltips", () => {
    const { bar } = renderActions(sevenWondersGame, 'card');
    expect(bar).toHaveClass('card-foot-end');
    expect(within(bar).getByRole('link', { name: 'Score' })).toHaveAttribute('title', 'Score Calculator');
    expect(within(bar).getByRole('link', { name: /YouTube/ })).toHaveAttribute('title', 'Watch Tutorial');
  });

  it('closes an open row without tooltips', () => {
    const { bar } = renderActions(bananagramsGame, 'row');
    expect(bar).toHaveClass('row-expand-foot');
    expect(within(bar).getByRole('link', { name: 'Word Checker' })).not.toHaveAttribute('title');
    expect(within(bar).getByRole('link', { name: /YouTube/ })).not.toHaveAttribute('title');
  });

  it.each([
    ['Score', sevenWondersGame, '/score/7-wonders'],
    ['Word Checker', bananagramsGame, '/word-checker'],
  ])('opens the %s page as leaving the list, without toggling the row', (name, game, pathname) => {
    const { router, onOuter } = renderActions(game, 'row');
    fireEvent.click(screen.getByRole('link', { name }));
    expect(router.state.location).toMatchObject({ pathname, state: { fromList: true } });
    expect(onOuter).not.toHaveBeenCalled();
  });
});
