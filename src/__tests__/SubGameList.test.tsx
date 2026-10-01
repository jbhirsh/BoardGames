import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import SubGameList from '../components/SubGameList';
import { FilterProvider } from '../context/FilterContext';
import { deckGame, addonGame } from './testData';
import type { Game } from '../data/types';

type WithSubs = Game & { subgames: NonNullable<Game['subgames']> };

// The list sits inside a table row that toggles on click, so its links must
// stop the click there; a listener above the React root sees whatever leaks.
function renderList(game: Game, url = '/') {
  const onParentClick = vi.fn();
  document.addEventListener('click', onParentClick);
  listeners.push(onParentClick);
  render(
    <MemoryRouter initialEntries={[url]}>
      <FilterProvider>
        <SubGameList game={game as WithSubs} />
      </FilterProvider>
    </MemoryRouter>,
  );
  return { onParentClick };
}

const rows = () => screen.getAllByRole('listitem');

const listeners: EventListener[] = [];
afterEach(() => {
  for (const l of listeners.splice(0)) document.removeEventListener('click', l);
  vi.restoreAllMocks();
});

describe('SubGameList', () => {
  it('shows each game\'s name, players, time and line, in order', () => {
    renderList(deckGame);
    expect(rows().map((r) => within(r).getByText(/Speed|President/).textContent)).toEqual(['Speed', 'President']);
    const speed = rows()[0];
    expect(speed).toHaveTextContent('2');
    expect(speed).toHaveTextContent('5 min');
    expect(speed).toHaveTextContent('Race to empty your hand.');
  });

  it('links each game to its tab on the parent\'s rules page', () => {
    renderList(deckGame);
    expect(screen.getByRole('link', { name: 'Speed rules' })).toHaveAttribute('href', '/rules/deck/speed');
    expect(screen.getByRole('link', { name: 'President rules' })).toHaveAttribute('href', '/rules/deck/president');
  });

  it('has no rules link for an add-on whose rules came in the box, and marks its kind', () => {
    renderList(addonGame);
    expect(screen.queryByRole('link', { name: 'Big Box rules' })).not.toBeInTheDocument();
    expect(screen.getByText('expansion')).toHaveClass('kind-chip', 'kind-expansion');
  });

  it('shows a game\'s own award wins, and no badge without any', () => {
    const game = { ...addonGame, subgames: [{ ...addonGame.subgames![0], awards: [{ name: 'International Gamers Award', year: 2005 }] }] };
    renderList(game);
    fireEvent.click(screen.getByRole('button', { name: 'Big Box: 1 award, show which' }));
    expect(screen.getByText(/International Gamers Award/)).toBeInTheDocument();
  });

  it('marks no kind on a deck\'s card games', () => {
    renderList(deckGame);
    expect(document.querySelector('.kind-chip')).toBeNull();
  });

  it('opens the game\'s video in a new tab without toggling the row around it', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { onParentClick } = renderList(deckGame);
    const video = screen.getByRole('link', { name: 'Watch Speed tutorial on YouTube' });
    expect(video).toHaveAttribute('href', expect.stringContaining('how%20to%20play%20speed'));
    fireEvent.click(video);
    expect(open).toHaveBeenCalledWith(video.getAttribute('href'), '_blank');
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('keeps a rules click from toggling the row around it', () => {
    const { onParentClick } = renderList(deckGame);
    fireEvent.click(screen.getByRole('link', { name: 'Speed rules' }));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('lists only the games that fit the filters', () => {
    renderList(deckGame, '/?p=5');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('President');
    expect(screen.queryByText('Speed')).not.toBeInTheDocument();
  });

  describe('more about a game', () => {
    const fuller = {
      ...addonGame,
      subgames: [{
        ...addonGame.subgames![0],
        desc: 'Every piece doubled, and a sea to sail.',
        detail: '<div class="detail-section"><h3>What It Adds</h3><p>Ships and a harbour.</p></div>',
      }],
    };

    it('opens in place to the full description and its sections, and closes again', () => {
      renderList(fuller);
      const more = screen.getByRole('button', { name: 'More about Big Box' });
      expect(more).toHaveTextContent('More');
      expect(more).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('Every piece doubled, and a sea to sail.')).not.toBeInTheDocument();

      fireEvent.click(more);
      const less = screen.getByRole('button', { name: 'Less about Big Box' });
      expect(less).toHaveAttribute('aria-expanded', 'true');
      const panel = document.getElementById(less.getAttribute('aria-controls')!)!;
      expect(panel).toBeVisible();
      expect(panel).toHaveTextContent('Every piece doubled, and a sea to sail.');
      expect(within(panel).getByRole('heading', { name: 'What It Adds' })).toBeInTheDocument();
      expect(panel).toHaveTextContent('Ships and a harbour.');

      fireEvent.click(less);
      expect(screen.getByRole('button', { name: 'More about Big Box' })).toHaveAttribute('aria-expanded', 'false');
      expect(panel).not.toBeVisible();
      expect(screen.queryByText('Ships and a harbour.')).not.toBeInTheDocument();
    });

    it('shows a description without sections', () => {
      const descOnly = { ...fuller, subgames: [{ ...fuller.subgames[0], detail: undefined }] };
      renderList(descOnly);
      fireEvent.click(screen.getByRole('button', { name: 'More about Big Box' }));
      expect(screen.getByText('Every piece doubled, and a sea to sail.')).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });

    it('shows sections without a description', () => {
      const detailOnly = { ...fuller, subgames: [{ ...fuller.subgames[0], desc: undefined }] };
      renderList(detailOnly);
      fireEvent.click(screen.getByRole('button', { name: 'More about Big Box' }));
      expect(screen.getByRole('heading', { name: 'What It Adds' })).toBeInTheDocument();
      expect(document.querySelector('.sub-desc')).toBeNull();
    });

    it('keeps the toggle from toggling the row around it', () => {
      const { onParentClick } = renderList(fuller);
      fireEvent.click(screen.getByRole('button', { name: 'More about Big Box' }));
      expect(onParentClick).not.toHaveBeenCalled();
    });

    it('has no toggle when there is nothing more to say', () => {
      renderList(deckGame);
      expect(screen.queryByRole('button', { name: /More about/ })).not.toBeInTheDocument();
    });
  });
});
