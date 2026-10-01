import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameRow from '../components/GameRow';
import { FilterProvider } from '../context/FilterContext';
import { quickGame, bananagramsGame, sevenWondersGame, deckGame, addonGame } from './testData';
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

  it('has a labelled chevron button that toggles the row once, and keeps the closed panel inert', () => {
    const onToggle = vi.fn();
    const { rerender } = renderRow(quickGame, false, onToggle);
    const chevron = screen.getByRole('button', { name: 'Show details for Quick Game' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.row-expand-inner')).toHaveAttribute('inert');
    fireEvent.click(chevron);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(
      <MemoryRouter>
        <FilterProvider>
          <table><tbody><GameRow game={quickGame} isOpen onToggle={onToggle} showGroupBadge={false} /></tbody></table>
        </FilterProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Hide details for Quick Game' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.row-expand-inner')).not.toHaveAttribute('inert');
  });

  it('shows the award count in the row and the full list when expanded', () => {
    const game: Game = { ...quickGame, awards: [{ name: 'Mensa Select', year: 2009 }, { name: 'As d\'Or', year: 2010 }] };
    const { container } = renderRow(game, true);
    // The count sits in the name column; the list lives in the expand section.
    const nameCell = container.querySelector('td.col-name')!;
    const pill = screen.getByRole('button', { name: 'Quick Game: 2 awards, show which' });
    expect(nameCell).toContainElement(pill);
    expect(pill).toHaveTextContent(/🏆\s*2$/);
    expect(nameCell.querySelector('.awards-list')).toBeNull();
    const expand = container.querySelector('tr.row-expand')!;
    expect(expand.querySelector('.row-awards h3')).toHaveTextContent('Awards');
    expect(expand.querySelectorAll('.awards-list li')).toHaveLength(2);
  });

  it('shows neither an award pill nor an Awards section for games with no wins', () => {
    const { container } = renderRow(quickGame, true);
    expect(container.querySelector('.awards')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Awards' })).not.toBeInTheDocument();
  });

  it('lists the wins from the award count, like a card, without toggling the row', () => {
    const onToggle = vi.fn();
    renderRow({ ...quickGame, awards: [{ name: 'Mensa Select', year: 2009 }] }, false, onToggle);
    fireEvent.click(screen.getByRole('button', { name: 'Quick Game: 1 award, show which' }));
    expect(screen.getByRole('group', { name: 'Quick Game: 1 award' })).toHaveTextContent('Mensa Select');
    expect(onToggle).not.toHaveBeenCalled();
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

  it('clicking the Score or Word Checker link does not trigger row toggle', () => {
    const onToggle = vi.fn();
    const { unmount } = renderRow(sevenWondersGame, true, onToggle);
    fireEvent.click(screen.getByText('Score'));
    unmount();
    renderRow(bananagramsGame, true, onToggle);
    fireEvent.click(screen.getByText('Word Checker'));
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

  it('lists the games inside under their own heading in the expanded row', () => {
    renderRow(deckGame, true);
    expect(screen.getByRole('heading', { name: 'Games in this deck' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Deck games' })).toBeInTheDocument();
  });

  it('builds the list of games inside only once the row is open', () => {
    renderRow(deckGame, false);
    expect(document.querySelector('.row-subgames')).toBeNull();
  });

  it('tags a game that holds others beside its name, and no game that holds none', () => {
    renderRow(addonGame);
    expect(screen.getByRole('button', { name: 'Island: +1 expansion, show which' })).toBeInTheDocument();
    expect(document.querySelector('.col-name-line .sub-tag-full')).toHaveTextContent('+1 expansion');
    cleanup();
    renderRow(deckGame);
    expect(document.querySelector('.sub-tag-full')).toHaveTextContent('+2 games');
    // A narrow name column shows just the count.
    expect(document.querySelector('.sub-tag-short')).toHaveTextContent('+2');
    cleanup();
    renderRow(quickGame);
    expect(document.querySelector('.sub-tag')).toBeNull();
  });

  it('tags how many fit once players or time is chosen, and leaves the tag off when none do', () => {
    const renderAt = (url: string) => render(
      <MemoryRouter initialEntries={[url]}>
        <FilterProvider>
          <table><tbody><GameRow game={deckGame} isOpen={false} onToggle={vi.fn()} showGroupBadge={false} /></tbody></table>
        </FilterProvider>
      </MemoryRouter>,
    );
    renderAt('/?p=2');
    expect(document.querySelector('.sub-tag-full')).toHaveTextContent('1 of 2 games fit');
    expect(document.querySelector('.sub-tag-short')).toHaveTextContent('+1');
    cleanup();
    renderAt('/?p=9');
    expect(document.querySelector('.sub-tag')).toBeNull();
  });

  it('lists the names of the games that fit from the tag, without toggling the row', () => {
    const onToggle = vi.fn();
    render(
      <MemoryRouter initialEntries={['/?p=2']}>
        <FilterProvider>
          <table><tbody><GameRow game={deckGame} isOpen={false} onToggle={onToggle} showGroupBadge={false} /></tbody></table>
        </FilterProvider>
      </MemoryRouter>,
    );
    const tag = screen.getByRole('button', { name: 'Deck: 1 of 2 games fit, show which' });
    fireEvent.mouseEnter(tag);
    const list = screen.getByRole('group', { name: 'Deck: 1 of 2 games fit' });
    expect(Array.from(list.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Speed']);
    fireEvent.mouseLeave(tag);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    fireEvent.click(tag);
    expect(screen.getByRole('group')).toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('heads expansions as expansions, and has no such section without any', () => {
    renderRow(addonGame, true);
    expect(screen.getByRole('heading', { name: 'Expansions' })).toBeInTheDocument();
    cleanup();
    renderRow(quickGame, true);
    expect(screen.queryByRole('heading', { name: 'Expansions' })).not.toBeInTheDocument();
    expect(document.querySelector('.row-subgames')).toBeNull();
  });

  it('leaves the section out when none of the games inside fit the filters', () => {
    render(
      <MemoryRouter initialEntries={['/?p=9']}>
        <FilterProvider>
          <table><tbody><GameRow game={deckGame} isOpen onToggle={vi.fn()} showGroupBadge={false} /></tbody></table>
        </FilterProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading', { name: 'Games in this deck' })).not.toBeInTheDocument();
  });
});
