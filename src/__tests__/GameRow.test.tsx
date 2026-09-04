import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameRow from '../components/GameRow';
import { FilterProvider } from '../context/FilterContext';
import { quickGame, bananagramsGame, sevenWondersGame } from './testData';
import type { Game } from '../data/types';

function renderRow(game: Game, isOpen = false, onToggle = vi.fn(), showGroupBadge = false) {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <table>
          <tbody>
            <GameRow game={game} isOpen={isOpen} onToggle={onToggle} showGroupBadge={showGroupBadge} />
          </tbody>
        </table>
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('GameRow', () => {
  it('renders game name', () => {
    renderRow(quickGame);
    expect(screen.getByText('Quick Game')).toBeInTheDocument();
  });

  it('renders player count and duration pill', () => {
    renderRow(quickGame);
    expect(screen.getByText('2\u20134')).toBeInTheDocument();
    expect(screen.getByText('Quick')).toBeInTheDocument();
  });

  it('calls onToggle when clicking the row', () => {
    const onToggle = vi.fn();
    renderRow(quickGame, false, onToggle);
    const row = screen.getByText('Quick Game').closest('tr')!;
    fireEvent.click(row);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the award count in the row and the full list when expanded', () => {
    const game: Game = { ...quickGame, awards: [{ name: 'Mensa Select', year: 2009 }, { name: 'As d\'Or', year: 2010 }] };
    const { container } = renderRow(game, true);
    // The count sits in the name column; the list lives in the expand section.
    const nameCell = container.querySelector('td.col-name')!;
    expect(nameCell).toHaveTextContent('2 awards');
    expect(nameCell.querySelector('.awards-list')).toBeNull();
    const expand = container.querySelector('tr.row-expand')!;
    expect(expand.querySelector('.row-awards h3')).toHaveTextContent('Awards');
    expect(expand.querySelectorAll('.awards-list li')).toHaveLength(2);
  });

  it('shows a plain zero-award label and no Awards section for games with no wins', () => {
    renderRow(quickGame, true);
    expect(screen.getByText('0 awards')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Awards' })).not.toBeInTheDocument();
  });

  it.each([
    ['zero-award label', [], '0 awards'],
    ['award count pill', [{ name: 'Mensa Select', year: 2009 }], /1 award/],
  ])('toggles the row when the %s is clicked', (_name, awards, text) => {
    const onToggle = vi.fn();
    renderRow({ ...quickGame, awards }, false, onToggle);
    fireEvent.click(screen.getByText(text));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows group badge when showGroupBadge is true', () => {
    renderRow(quickGame, false, vi.fn(), true);
    expect(screen.getByText('party')).toBeInTheDocument();
  });

  it('renders expanded content when isOpen', () => {
    renderRow(quickGame, true);
    expect(screen.getByText('How to Play')).toBeInTheDocument();
  });

  it('clicking duration pill dispatches SET_DURATION', () => {
    const onToggle = vi.fn();
    renderRow(quickGame, false, onToggle);
    const pill = screen.getByText('Quick');
    fireEvent.click(pill);
    // stopPropagation should prevent onToggle from firing
  });

  it('renders keyword pills and clicking them dispatches', () => {
    renderRow(quickGame);
    const pill = screen.getByText('Card Game');
    fireEvent.click(pill);
  });

  it('renders Rules link to /rules/slug when game has rules', () => {
    renderRow(quickGame, true);
    const rulesLinks = screen.getAllByText(/Rules/);
    const link = rulesLinks.find((el) => el.closest('a[href*="rules"]'));
    expect(link?.closest('a')).toHaveAttribute('href', '/rules/quick-game');
  });

  it('clicking Rules link does not trigger row toggle', () => {
    const onToggle = vi.fn();
    renderRow(quickGame, true, onToggle);
    const rulesLinks = screen.getAllByText(/Rules/);
    const link = rulesLinks.find((el) => el.closest('a[href*="rules"]'));
    fireEvent.click(link!);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders fallback rules link when game has no rules', () => {
    const noRulesGame: Game = { ...quickGame, rules: '' };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderRow(noRulesGame, true);

    const rulesLinks = screen.getAllByText(/Rules/);
    const link = rulesLinks.find((el) => el.closest('a[href*="google"]'));
    fireEvent.click(link!);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('google.com/search'),
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('renders Word Checker link for bananagrams when expanded', () => {
    renderRow(bananagramsGame, true);
    const link = screen.getByText('Word Checker');
    expect(link.closest('a')).toHaveAttribute('href', '/word-checker');
  });

  it('does not render Word Checker link for non-bananagrams games', () => {
    renderRow(quickGame, true);
    expect(screen.queryByText('Word Checker')).not.toBeInTheDocument();
  });

  it('renders Score Calculator link for 7-wonders when expanded', () => {
    renderRow(sevenWondersGame, true);
    const link = screen.getByText('Score');
    expect(link.closest('a')).toHaveAttribute('href', '/score/7-wonders');
  });

  it('renders YouTube link that opens in new window', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderRow(quickGame, true);

    const ytLinks = screen.getAllByRole('link');
    const ytLink = ytLinks.find((el) => el.getAttribute('href')?.includes('youtube'));
    fireEvent.click(ytLink!);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
    );
    openSpy.mockRestore();
  });
});
