import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PhoneListView from '../components/PhoneListView';
import WishLine from '../components/WishLine';
import WishlistPhoneListView from '../components/WishlistPhoneListView';
import { FilterProvider } from '../context/FilterContext';
import { WISHLIST } from '../data/wishlist';
import { WISHLIST_TYPES } from '../data/keywords';
import { groupItems } from '../utils/filterGames';
import { WISHLIST_TYPE_ORDER } from '../data/keywords';
import type { WishlistItem } from '../data/types';

function renderGames(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <FilterProvider>
        <PhoneListView />
      </FilterProvider>
    </MemoryRouter>,
  );
}

function renderWithFilter(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <FilterProvider>{ui}</FilterProvider>
    </MemoryRouter>,
  );
}

describe('PhoneListView', () => {
  it('lists a line a game, its name over its players, time and difficulty word, with Rules beside it', () => {
    renderGames();
    const line = screen.getByRole('heading', { level: 3, name: 'Azul' }).closest('li')!;
    expect(line).toHaveAttribute('id', 'game-azul');
    expect(within(line).getByText('2–4 · 30–45 min · Light')).toBeInTheDocument();
    expect(within(line).getByRole('link', { name: 'Rules for Azul' })).toBeInTheDocument();
    expect(line.querySelector('.line-detail')).toHaveAttribute('inert');
  });

  it('opens one line at a time, showing the pitch, tags, write-up, add-ons and actions', () => {
    renderGames();
    fireEvent.click(screen.getByRole('button', { name: 'Show details for Catan' }));
    const catan = screen.getByRole('heading', { level: 3, name: 'Catan' }).closest('li')!;
    expect(catan).toHaveClass('open');
    expect(catan.querySelector('.line-detail')).not.toHaveAttribute('inert');
    expect(within(catan).getByRole('list', { name: /Catan/ })).toBeInTheDocument();
    expect(within(catan).getByRole('link', { name: /Watch Catan tutorial/ })).toBeInTheDocument();
    // Rules is on the line, so the actions under it don't repeat it.
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
  const plain: WishlistItem = { ...WISHLIST[0], img: undefined, players: '', dur: '', desc: 'A plain one. With more.' };

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
