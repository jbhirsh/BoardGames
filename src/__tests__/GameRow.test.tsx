import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameRow from '../components/GameRow';
import { FilterProvider } from '../context/FilterContext';
import { quickGame, bananagramsGame, sevenWondersGame, deckGame, addonGame } from './testData';
import type { Game } from '../data/types';
import { GAMES } from '../data/games';
import { renderRouted } from './routed';

function renderRow(game: Game, isOpen = false, onToggle = vi.fn()) {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <table>
          <tbody>
            <GameRow game={game} isOpen={isOpen} onToggle={onToggle} />
          </tbody>
        </table>
      </FilterProvider>
    </MemoryRouter>,
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
    expect(screen.getByText('10 min')).toBeInTheDocument();
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
          <table>
            <tbody>
              <GameRow game={quickGame} isOpen onToggle={onToggle} />
            </tbody>
          </table>
        </FilterProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Hide details for Quick Game' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(document.querySelector('.row-expand-inner')).not.toHaveAttribute('inert');
  });

  it('shows the award count in the row and the full list when expanded', () => {
    const game: Game = {
      ...quickGame,
      awards: [
        { name: 'Mensa Select', year: 2009 },
        { name: "As d'Or", year: 2010 },
      ],
    };
    const { container } = renderRow(game, true);
    // The count closes the description; the list lives in the expand section.
    const column = container.querySelector('td.col-short') as HTMLElement;
    const pill = within(column).getByRole('button', { name: 'Quick Game: 2 awards, show which' });
    expect(pill).toHaveTextContent(/🏆\s*2$/);
    expect(column.querySelector('.awards-list')).toBeNull();
    expect(container.querySelector('td.col-name > .col-name-wrap > .col-name .awards')).toBeNull();
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
    const { container } = renderRow({ ...quickGame, awards: [{ name: 'Mensa Select', year: 2009 }] }, false, onToggle);
    const column = container.querySelector('td.col-short') as HTMLElement;
    fireEvent.click(within(column).getByRole('button', { name: 'Quick Game: 1 award, show which' }));
    const list = screen.getByRole('group', { name: 'Quick Game: 1 award' });
    expect(list).toHaveTextContent('Mensa Select');
    fireEvent.click(within(list).getByText('Mensa Select'));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('renders expanded content when isOpen', () => {
    renderRow(quickGame, true);
    expect(screen.getByText('How to Play')).toBeInTheDocument();
  });

  it('clicking duration pill dispatches SET_DURATION', () => {
    const onToggle = vi.fn();
    renderRow(quickGame, false, onToggle);
    const pill = screen.getByText('10 min');
    fireEvent.click(pill);
    // stopPropagation should prevent onToggle from firing
  });

  it('renders keyword pills and clicking them dispatches', () => {
    renderRow(quickGame);
    const pill = screen.getByText('Card Game');
    fireEvent.click(pill);
  });

  it('points Rules at the add-on the players filter admits the game through', () => {
    const catan = GAMES.find((g) => g.slug === 'catan')!;
    render(
      <MemoryRouter initialEntries={['/?p=5']}>
        <FilterProvider>
          <table>
            <tbody>
              <GameRow game={catan} isOpen onToggle={vi.fn()} />
            </tbody>
          </table>
        </FilterProvider>
      </MemoryRouter>,
    );
    // Only the open panel carries Rules; the row itself has none.
    expect(screen.getByRole('link', { name: 'Rules for Catan' })).toHaveAttribute(
      'href',
      '/rules/catan/5-6-player-extension',
    );
  });

  it('gives a collapsed row no Rules link: the actions cell holds only the chevron', () => {
    renderRow(sevenWondersGame);
    const row = document.querySelector('tr.game-row') as HTMLElement;
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
    const cell = row.querySelector('td.col-actions')!;
    expect(Array.from(cell.children).map((el) => el.tagName)).toEqual(['BUTTON']);
    expect(within(cell as HTMLElement).getByRole('button')).toHaveAccessibleName('Show details for 7 Wonders');
    // The shut panel's link is the only one, and it is inert until the row opens.
    expect(screen.getAllByRole('link', { name: 'Rules for 7 Wonders', hidden: true })).toHaveLength(1);
  });

  it('searches for the rules from the open panel of a game without a rulebook, without toggling it', () => {
    const onToggle = vi.fn();
    renderRow({ ...quickGame, rules: '' }, true, onToggle);
    const panel = document.querySelector('tr.row-expand') as HTMLElement;
    const link = within(panel).getByRole('link', { name: 'Rules for Quick Game' });
    expect(link).toHaveTextContent(/^Rules$/);
    expect(link).toHaveAttribute('href', expect.stringContaining('google.com/search'));
    expect(link).toHaveAttribute('title', 'Rules for Quick Game');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('ends the open row with its actions on the right, after the write-up: Rules filled first, the video last', () => {
    renderRow(sevenWondersGame, true);
    const content = document.querySelector('.row-expand-content') as HTMLElement;
    const foot = content.lastElementChild as HTMLElement;
    expect(foot).toHaveClass('row-expand-foot');
    expect(content.querySelector('.row-expand-actions')).toBeNull();
    const links = within(foot).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('aria-label') ?? a.textContent!.trim())).toEqual([
      'Rules for 7 Wonders',
      'Score',
      'Watch 7 Wonders tutorial on YouTube',
    ]);
    expect(links[0]).toHaveClass('rules-btn', 'rules-btn--primary');
    expect(links[1]).toHaveClass('rules-btn');
    expect(links[1]).not.toHaveClass('rules-btn--primary');
    expect(links[2]).toHaveClass('row-yt');
    // The write-up comes first, and every section of the panel before the actions.
    expect(content.firstElementChild).toHaveClass('detail-section');
    expect(content.firstElementChild).toHaveTextContent(
      `${sevenWondersGame.detail[0].heading}${sevenWondersGame.detail[0].body}`,
    );
    for (const section of Array.from(content.children).slice(0, -1)) expect(section).toHaveClass('detail-section');
    cleanup();
    renderRow(bananagramsGame, true);
    const bananaContent = document.querySelector('.row-expand-content') as HTMLElement;
    const bananaFoot = bananaContent.lastElementChild as HTMLElement;
    expect(bananaFoot).toHaveClass('row-expand-foot');
    expect(
      within(bananaFoot)
        .getAllByRole('link')
        .map((a) => a.getAttribute('aria-label') ?? a.textContent!.trim()),
    ).toEqual(['Rules for Bananagrams', 'Word Checker', 'Watch Bananagrams tutorial on YouTube']);
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

  it.each([
    ['Rules for 7 Wonders', sevenWondersGame, '/rules/7-wonders'],
    ['Score', sevenWondersGame, '/score/7-wonders'],
    ['Word Checker', bananagramsGame, '/word-checker'],
  ])("marks the open row's %s link as leaving the list, so the page's Back returns to it", (name, game, pathname) => {
    const router = renderRouted(
      <FilterProvider>
        <table>
          <tbody>
            <GameRow game={game} isOpen onToggle={vi.fn()} />
          </tbody>
        </table>
      </FilterProvider>,
    );
    const panel = document.querySelector('tr.row-expand') as HTMLElement;
    fireEvent.click(within(panel).getByRole('link', { name }));
    expect(router.state.location).toMatchObject({ pathname, state: { fromList: true } });
  });

  it('renders fallback rules link when game has no rules', () => {
    const noRulesGame: Game = { ...quickGame, rules: '' };
    renderRow(noRulesGame, true);

    const rulesLinks = screen.getAllByText(/Rules/);
    const link = rulesLinks.find((el) => el.closest('a[href*="google"]'));

    expect(link!.closest('a')).toHaveAttribute('href', expect.stringContaining('google.com/search'));
    expect(link!.closest('a')).toHaveAttribute('target', '_blank');
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
    renderRow(quickGame, true);

    const ytLinks = screen.getAllByRole('link');
    const ytLink = ytLinks.find((el) => el.getAttribute('href')?.includes('youtube'));

    expect(ytLink).toHaveAttribute('href', expect.stringContaining('youtube.com'));
    expect(ytLink).toHaveAttribute('target', '_blank');
    expect(ytLink).toHaveAttribute('rel', 'noopener noreferrer');
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

  it('closes the description with the add-ons tag, then the award count, and tags no game that holds none', () => {
    renderRow({ ...addonGame, awards: [{ name: 'Mensa Select', year: 2009 }] });
    // One copy in the description column, one in the description folded
    // under the name for narrow widths; CSS shows one of them.
    const inColumn = document.querySelector('td.col-short > .row-badges') as HTMLElement;
    const folded = document.querySelector('td.col-name .mobile-short > .row-badges') as HTMLElement;
    for (const badges of [inColumn, folded]) {
      expect(within(badges).getByRole('button', { name: 'Island: +1 expansion, show which' })).toHaveTextContent(
        '+1 expansion',
      );
      expect(badges.children).toHaveLength(2);
      expect(badges.children[0]).toHaveClass('sub-tag-wrap');
      expect(badges.children[1]).toHaveClass('awards');
      expect(badges.parentElement!.firstChild!.textContent).toBe(addonGame.short);
    }
    // The name stands alone.
    expect(document.querySelector('td.col-name .col-name')!.textContent).toBe('Island');
    cleanup();
    renderRow(deckGame);
    expect(document.querySelector('td.col-short .sub-tag')).toHaveTextContent('+2 games');
    cleanup();
    renderRow(quickGame);
    expect(document.querySelector('.sub-tag')).toBeNull();
  });

  it('tags how many fit once players or time is chosen, and leaves the tag off when none do', () => {
    const renderAt = (url: string) =>
      render(
        <MemoryRouter initialEntries={[url]}>
          <FilterProvider>
            <table>
              <tbody>
                <GameRow game={deckGame} isOpen={false} onToggle={vi.fn()} />
              </tbody>
            </table>
          </FilterProvider>
        </MemoryRouter>,
      );
    renderAt('/?p=2');
    expect(document.querySelector('td.col-short .sub-tag')).toHaveTextContent('1 of 2 games fit');
    cleanup();
    renderAt('/?p=9');
    expect(document.querySelector('.sub-tag')).toBeNull();
  });

  it('lists the names of the games that fit from the tag, without toggling the row', () => {
    const onToggle = vi.fn();
    render(
      <MemoryRouter initialEntries={['/?p=2']}>
        <FilterProvider>
          <table>
            <tbody>
              <GameRow game={deckGame} isOpen={false} onToggle={onToggle} />
            </tbody>
          </table>
        </FilterProvider>
      </MemoryRouter>,
    );
    const column = document.querySelector('td.col-short') as HTMLElement;
    const tag = within(column).getByRole('button', { name: 'Deck: 1 of 2 games fit, show which' });
    fireEvent.mouseEnter(tag);
    const list = screen.getByRole('group', { name: 'Deck: 1 of 2 games fit' });
    expect(Array.from(list.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Speed']);
    fireEvent.mouseLeave(tag);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    fireEvent.click(tag);
    const pinned = screen.getByRole('group');
    // The panel is portalled out of the row, but React still bubbles its
    // clicks up the component tree to the row's handler.
    fireEvent.click(within(pinned).getByText('Speed'));
    fireEvent.click(within(pinned).getByText('Deck: 1 of 2 games fit'));
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
          <table>
            <tbody>
              <GameRow game={deckGame} isOpen onToggle={vi.fn()} />
            </tbody>
          </table>
        </FilterProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('heading', { name: 'Games in this deck' })).not.toBeInTheDocument();
  });
});
