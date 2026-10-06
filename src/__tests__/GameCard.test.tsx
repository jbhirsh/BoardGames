import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameCard from '../components/GameCard';
import { GAMES } from '../data/games';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import { quickGame, mediumGame, bananagramsGame, sevenWondersGame, deckGame, addonGame } from './testData';
import type { Game } from '../data/types';

function renderWithContext(ui: React.ReactElement, url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FilterProvider>{ui}</FilterProvider>
    </MemoryRouter>
  );
}

describe('GameCard', () => {
  it('renders the game name', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('Quick Game')).toBeInTheDocument();
  });

  it('renders the player count and duration', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('2–4')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
  });

  it('renders an award badge that lists the wins when opened', () => {
    const game: Game = { ...quickGame, awards: [{ name: 'Spiel des Jahres', year: 2016 }] };
    renderWithContext(<GameCard game={game} />);
    fireEvent.click(screen.getByRole('button', { name: `${game.name}: 1 award, show which` }));
    expect(screen.getByRole('listitem')).toHaveTextContent('Spiel des Jahres');
  });

  it('shows no award pill at all when the game has no wins', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.queryByText(/award/)).not.toBeInTheDocument();
    expect(document.querySelector('.awards')).toBeNull();
  });

  it('renders keyword pills', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('Card Game')).toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
  });

  it('renders the short description', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.getByText('A quick card game.')).toBeInTheDocument();
  });

  it('renders Rules link pointing to /rules/slug when game has rules', () => {
    renderWithContext(<GameCard game={quickGame} />);
    const rulesLink = screen.getByTitle('Rules');
    expect(rulesLink).toBeInTheDocument();
    expect(rulesLink.closest('a')).toHaveAttribute('href', '/rules/quick-game');
  });

  it('points Rules at the add-on the players filter admits the game through', () => {
    const catan = GAMES.find((g) => g.slug === 'catan')!;
    renderWithContext(<GameCard game={catan} />, '/?p=5');
    expect(screen.getByTitle('Rules').closest('a')).toHaveAttribute('href', '/rules/catan/5-6-player-extension');
  });

  it('renders fallback rules link when game has no rules field', () => {
    const noRulesGame: Game = { ...quickGame, rules: '' };
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderWithContext(<GameCard game={noRulesGame} />);
    const rulesLink = screen.getByTitle('Rules');
    fireEvent.click(rulesLink);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('google.com/search'),
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('renders YouTube link that opens in new window', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderWithContext(<GameCard game={quickGame} />);
    const ytLink = screen.getByTitle('Watch Tutorial');
    fireEvent.click(ytLink);

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('youtube.com'),
      '_blank',
    );
    openSpy.mockRestore();
  });

  it('renders Word Checker link for bananagrams', () => {
    renderWithContext(<GameCard game={bananagramsGame} />);
    const link = screen.getByTitle('Word Checker');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/word-checker');
  });

  it('does not render Word Checker link for non-bananagrams games', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.queryByTitle('Word Checker')).not.toBeInTheDocument();
  });

  it('renders Score Calculator link for 7-wonders', () => {
    renderWithContext(<GameCard game={sevenWondersGame} />);
    const link = screen.getByTitle('Score Calculator');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/score/7-wonders');
  });

  it('does not render Score Calculator link for non-7-wonders games', () => {
    renderWithContext(<GameCard game={quickGame} />);
    expect(screen.queryByTitle('Score Calculator')).not.toBeInTheDocument();
  });

  it('clicking a keyword pill dispatches TOGGLE_KEYWORD', () => {
    renderWithContext(<GameCard game={mediumGame} />);
    const pill = screen.getByText('Strategy');
    fireEvent.click(pill);
    // After clicking, the pill should be active (lit class)
    expect(pill).toHaveClass('lit');
  });

  describe('games inside a game', () => {
    it('has no games button when nothing is inside', () => {
      renderWithContext(<GameCard game={quickGame} />);
      // The games button is named "<game>: +N games"; More is the card's other toggle.
      expect(screen.queryByRole('button', { name: /^Quick Game: /, expanded: false })).not.toBeInTheDocument();
    });

    it('sits bottom left with the award count, apart from the links, so the head holds the same things on every card', () => {
      renderWithContext(<GameCard game={{ ...deckGame, awards: [{ name: 'Mensa Select', year: 2009 }] }} />);
      const start = document.querySelector('.card-foot .card-foot-start')!;
      expect(start).toContainElement(screen.getByRole('button', { name: 'Deck: +2 games' }));
      expect(start).toContainElement(screen.getByRole('button', { name: 'Deck: 1 award, show which' }));
      expect(document.querySelector('.card-head .awards')).toBeNull();
      expect(document.querySelector('.card-foot-end')).toContainElement(screen.getByRole('link', { name: /Rules/ }));
      // The full label for a wide card, the count alone for a narrow one.
      expect(document.querySelector('.sub-pill-full')).toHaveTextContent('+2 games');
      expect(document.querySelector('.sub-pill-short')).toHaveTextContent('+2');
    });

    it('previews the names on hover, gone once the pointer leaves, like the award count', () => {
      renderWithContext(<GameCard game={deckGame} />);
      const pill = screen.getByRole('button', { name: 'Deck: +2 games' });
      fireEvent.mouseEnter(pill);
      const preview = screen.getByRole('tooltip');
      expect(Array.from(preview.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Speed', 'President']);
      expect(pill).toHaveAttribute('aria-describedby', preview.id);
      // The preview is no disclosure of its own: the button still says
      // whether the full list is open.
      expect(pill).toHaveAttribute('aria-expanded', 'false');
      fireEvent.mouseLeave(pill);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(pill).not.toHaveAttribute('aria-describedby');
    });

    it('swaps the preview for the full list on click, and previews nothing while that is open', () => {
      renderWithContext(<GameCard game={deckGame} />);
      const pill = screen.getByRole('button', { name: 'Deck: +2 games' });
      fireEvent.mouseEnter(pill);
      fireEvent.click(pill);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Deck games' })).toBeInTheDocument();
      fireEvent.mouseLeave(pill);
      fireEvent.mouseEnter(pill);
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Deck games' })).toBeInTheDocument();
      fireEvent.click(pill);
      expect(screen.queryByRole('list', { name: 'Deck games' })).not.toBeInTheDocument();
    });

    it('opens and closes the list of games from the button', () => {
      renderWithContext(<GameCard game={deckGame} />);
      const pill = screen.getByRole('button', { name: 'Deck: +2 games' });
      expect(pill).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('list', { name: 'Deck games' })).not.toBeInTheDocument();

      fireEvent.click(pill);
      expect(pill).toHaveAttribute('aria-expanded', 'true');
      const list = screen.getByRole('list', { name: 'Deck games' });
      expect(pill).toHaveAttribute('aria-controls', list.parentElement!.id);
      expect(list.parentElement!.id).not.toBe('');

      fireEvent.click(pill);
      expect(screen.queryByRole('list', { name: 'Deck games' })).not.toBeInTheDocument();
    });

    it('calls expansions expansions', () => {
      renderWithContext(<GameCard game={addonGame} />);
      fireEvent.click(screen.getByRole('button', { name: 'Island: +1 expansion' }));
      expect(screen.getByRole('list', { name: 'Island expansions' })).toBeInTheDocument();
    });

    it('says how many fit once players are chosen, and lists only those', () => {
      renderWithContext(<GameCard game={deckGame} />, '/?p=2');
      fireEvent.click(screen.getByRole('button', { name: 'Deck: 1 of 2 games fit' }));
      expect(screen.getAllByRole('listitem').map((li) => li.querySelector('.sub-name')!.textContent)).toEqual(['Speed']);
    });

    it('closes the list when a filter leaves nothing in it', () => {
      function NinePlayers() {
        const { dispatch } = useFilter();
        return <button type="button" onClick={() => dispatch({ type: 'SET_PLAYERS', payload: 9 })}>Nine players</button>;
      }
      renderWithContext(<><NinePlayers /><GameCard game={deckGame} /></>);
      fireEvent.click(screen.getByRole('button', { name: 'Deck: +2 games' }));
      expect(screen.getByRole('list', { name: 'Deck games' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Nine players' }));
      expect(screen.queryByRole('list', { name: 'Deck games' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Deck:/ })).not.toBeInTheDocument();
    });

    it('has no expansions button when the base game fits but none of its add-ons do', () => {
      // Island fits a medium game on its own; its long expansion doesn't, and
      // the button would open an empty list.
      renderWithContext(<GameCard game={addonGame} />, '/?d=medium');
      expect(screen.getByRole('heading', { name: 'Island' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /expansion/ })).not.toBeInTheDocument();
    });
  });
});

describe('GameCard add-ons layout', () => {
  it('takes a grid row of its own while its games are listed, so neighbours keep their height', () => {
    const { container } = renderWithContext(<GameCard game={deckGame} />);
    const card = container.querySelector('.game-card')!;
    expect(card).not.toHaveClass('card-open');
    fireEvent.click(screen.getByRole('button', { name: 'Deck: +2 games' }));
    expect(card).toHaveClass('card-open');
    fireEvent.click(screen.getByRole('button', { name: 'Deck: +2 games' }));
    expect(card).not.toHaveClass('card-open');
  });
});

describe('GameCard More', () => {
  it('sits at the end of the description and opens the long write-up and awards in place', () => {
    const game: Game = { ...quickGame, detail: '<h3>How it plays</h3><p>Full rules story.</p>', awards: [{ name: 'Mensa Select', year: 2009 }] };
    const { container } = renderWithContext(<GameCard game={game} />);
    const more = screen.getByRole('button', { name: 'More about Quick Game' });
    expect(more.closest('.card-desc')).toHaveTextContent(`${quickGame.short} More`);
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Full rules story.')).not.toBeInTheDocument();

    fireEvent.click(more);
    const less = screen.getByRole('button', { name: 'Less about Quick Game' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById(less.getAttribute('aria-controls')!)!;
    expect(panel).toHaveTextContent('Full rules story.');
    expect(panel.querySelector('.awards-list')).toHaveTextContent('Mensa Select');
    // The open card takes a grid row of its own.
    expect(container.querySelector('.game-card')).toHaveClass('card-open');

    fireEvent.click(less);
    expect(screen.queryByText('Full rules story.')).not.toBeInTheDocument();
    expect(container.querySelector('.game-card')).not.toHaveClass('card-open');
  });

  it('leaves out the Awards section for a game with none', () => {
    renderWithContext(<GameCard game={quickGame} />);
    fireEvent.click(screen.getByRole('button', { name: 'More about Quick Game' }));
    expect(screen.queryByRole('heading', { name: 'Awards' })).not.toBeInTheDocument();
  });
});
