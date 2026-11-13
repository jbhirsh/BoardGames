import { GamesFixture } from './helpers/GamesFixture';
import { WishlistFixture } from './helpers/WishlistFixture';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PhoneListView from '../components/PhoneListView';
import WishLine from '../components/WishLine';
import WishlistPhoneListView from '../components/WishlistPhoneListView';
import { FilterProvider } from '../context/FilterContext';
import { WEIGHED_GAMES, WISHLIST } from './helpers/wishlist';
import { WISHLIST_TYPES } from '../data/keywords';
import { groupItems } from '../utils/filterGames';
import { WISHLIST_TYPE_ORDER } from '../data/keywords';
import type { WishlistItem } from '../data/types';

function renderGames(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <GamesFixture>
        <FilterProvider>
          <WishlistFixture>
            <PhoneListView />
          </WishlistFixture>
        </FilterProvider>
      </GamesFixture>
    </MemoryRouter>,
  );
}

function renderWithFilter(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <WishlistFixture>{ui}</WishlistFixture>
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('PhoneListView', () => {
  it('lists a line a game, its name over its players, time and difficulty word, Rules waiting inside it', () => {
    renderGames();
    const line = screen.getByRole('heading', { level: 3, name: 'Azul' }).closest('li')!;
    expect(line).toHaveAttribute('id', 'game-azul');
    // The word is the fixture's weight's: made up (helpers/wishlist), since
    // real weights now come from the games query, not the code.
    const azul = WEIGHED_GAMES.find((g) => g.slug === 'azul')!;
    expect(azul.weight).toBe(2.4);
    expect(line.querySelector('.line-meta')).toHaveTextContent('2–4 players · 30–45 min · Medium');
    expect(line.querySelector('.line-detail')).toHaveAttribute('inert');
    expect(line.querySelector('.line-detail')).toContainElement(
      within(line).getByRole('link', { name: 'Rules for Azul' }),
    );
  });

  it('opens one line at a time, showing the pitch, tags, write-up, add-ons and actions', () => {
    renderGames();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Catan' }));
    const catan = screen.getByRole('heading', { level: 3, name: 'Catan' }).closest('li')!;
    expect(catan).toHaveClass('open');
    expect(catan.querySelector('.line-detail')).not.toHaveAttribute('inert');
    expect(within(catan).getByRole('list', { name: /Catan/ })).toBeInTheDocument();
    expect(within(catan).getByRole('link', { name: /Watch Catan tutorial/ })).toBeInTheDocument();
    expect(within(catan).getAllByRole('link', { name: 'Rules for Catan' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Show details for Azul' }));
    expect(catan).not.toHaveClass('open');
    expect(screen.getByRole('button', { name: 'Hide details for Azul' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('a tag in an open line filters by it', () => {
    renderGames();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Azul' }));
    const azul = screen.getByRole('heading', { level: 3, name: 'Azul' }).closest('li')!;
    fireEvent.click(within(azul).getByRole('button', { name: /Abstract/ }));
    expect(screen.queryByRole('heading', { level: 3, name: 'Codenames' })).not.toBeInTheDocument();
  });

  it("groups lines under the grid's headings, and says when nothing fits", () => {
    const { unmount } = renderGames('/?s=group');
    expect(document.querySelectorAll('.group-hd').length).toBeGreaterThan(1);
    expect(document.querySelectorAll('.lines').length).toBe(document.querySelectorAll('.group-hd').length);
    unmount();
    renderGames('/?q=zzzzzz');
    expect(document.querySelector('.lines')).toBeNull();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();
  });
});

describe('WishLine', () => {
  const plain: WishlistItem = {
    ...WISHLIST[0],
    img: undefined,
    players: '',
    dur: '',
    desc: 'A plain one. With more.',
    short: undefined,
  };

  it("stands a blank in for missing art, and the blurb's first sentence for missing players and time", () => {
    const { container } = renderWithFilter(
      <ul>
        <WishLine
          item={plain}
          voteCount={0}
          voted={false}
          onVote={() => {}}
          isOpen={false}
          onToggle={() => {}}
          headingLevel={4}
        />
      </ul>,
    );
    expect(container.querySelector('.line-art--none')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 4, name: plain.name })).toBeInTheDocument();
    expect(container.querySelector('.line-meta')).toHaveTextContent('A plain one.');
  });

  function renderLine(item: WishlistItem) {
    return renderWithFilter(
      <ul>
        <WishLine
          item={item}
          voteCount={0}
          voted={false}
          onVote={() => {}}
          isOpen={false}
          onToggle={() => {}}
          headingLevel={4}
        />
      </ul>,
    );
  }

  it("says its players, time and difficulty word as a game's line does, always with the word players", () => {
    const { container } = renderLine({ ...plain, players: '2–4', dur: '25 min', weight: 1.82 });
    const meta = container.querySelector('.line-meta')!;
    expect(meta).toHaveTextContent('2–4 players · 25 min · Light');
    // Too narrow beside the vote to keep it on one line, the line wraps
    // between the parts instead of dropping the word as a game's line does.
    expect(within(meta as HTMLElement).getByText('players', { exact: false })).not.toHaveClass(
      '[@container_(max-width:225px)]:hidden',
    );
    expect(meta.querySelectorAll('.whitespace-nowrap')).toHaveLength(3);
  });

  it('leaves out what it lacks: one player, no time or no difficulty', () => {
    const { container, unmount } = renderLine({ ...plain, players: '1', dur: '', weight: 3.4 });
    expect(container.querySelector('.line-meta')).toHaveTextContent(/^1 player · Heavy$/);
    unmount();
    renderLine({ ...plain, players: '', dur: '45 min', weight: undefined });
    expect(document.querySelector('.line-meta')).toHaveTextContent(/^45 min$/);
  });

  it('votes without toggling the line', () => {
    const onVote = vi.fn();
    const onToggle = vi.fn();
    renderWithFilter(
      <ul>
        <WishLine
          item={WISHLIST[0]}
          voteCount={2}
          voted={false}
          onVote={onVote}
          isOpen={false}
          onToggle={onToggle}
          headingLevel={3}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: `Vote for ${WISHLIST[0].name} (2 votes)` }));
    expect(onVote).toHaveBeenCalledWith(WISHLIST[0].id);
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: `Show details for ${WISHLIST[0].name}` }));
    expect(onToggle).toHaveBeenCalledWith(WISHLIST[0].id);
  });
});

describe('WishlistPhoneListView', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('puts each group under its heading, entries a level below, and opens one at a time', () => {
    const groups = groupItems(WISHLIST, WISHLIST_TYPE_ORDER, (w) => w.type);
    renderWithFilter(
      <WishlistPhoneListView groups={groups} counts={{}} myVotes={new Set()} onVote={() => {}} disabled={false} />,
    );
    const first = groups[0];
    expect(screen.getByRole('heading', { level: 3, name: WISHLIST_TYPES[first.key!] })).toBeInTheDocument();
    const [a, b] = first.items;
    expect(screen.getByRole('heading', { level: 4, name: a.name })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Show details for ${a.name}` }));
    fireEvent.click(screen.getByRole('button', { name: `Show details for ${b.name}` }));
    expect(screen.getByRole('button', { name: `Show details for ${a.name}` })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: `Hide details for ${b.name}` }));
    expect(screen.getByRole('button', { name: `Show details for ${b.name}` })).toBeInTheDocument();
  });

  it('lists a flat list at h3', () => {
    renderWithFilter(
      <WishlistPhoneListView
        groups={[{ key: null, items: WISHLIST.slice(0, 2) }]}
        counts={{}}
        myVotes={new Set()}
        onVote={() => {}}
        disabled={false}
      />,
    );
    expect(screen.getByRole('heading', { level: 3, name: WISHLIST[0].name })).toBeInTheDocument();
    expect(document.querySelector('.group-hd')).toBeNull();
  });
});
