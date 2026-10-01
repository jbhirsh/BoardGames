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
});
