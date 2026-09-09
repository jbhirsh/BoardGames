import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import WishlistCard from '../components/WishlistCard';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  id: 'test-wishlist-game',
  name: 'Test Wishlist Game',
  desc: 'A great game to add.',
  yt: 'test wishlist game review',
  players: '2–4',
  type: 'strategy',
  min: 2,
  max: 4,
  dur: '30 min',
  mins: 30,
  cat: 'medium',
  kw: ['strategy', 'card-game'],
  awards: [{ name: 'Spiel des Jahres', year: 2020 }],
};

type Props = React.ComponentProps<typeof WishlistCard>;

function KeywordProbe() {
  const { state } = useFilter();
  return <output>{[...state.keywords].join(',')}</output>;
}

function renderCard(overrides: Partial<Props> = {}) {
  const props: Props = { item: testItem, voteCount: 0, voted: false, onVote: () => {}, ...overrides };
  return render(
    <MemoryRouter>
      <FilterProvider>
        <WishlistCard {...props} />
        <KeywordProbe />
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('WishlistCard', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is built on the collection card: name, meta, keyword pills, description', () => {
    const { container } = renderCard();
    expect(container.querySelector('.game-card')).toHaveAttribute('data-item-id', 'test-wishlist-game');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Test Wishlist Game');
    expect(screen.getByText('A great game to add.')).toHaveClass('card-desc');
    expect(screen.getByText('2–4')).toHaveClass('cmeta');
    expect(screen.getByText('30 min')).toHaveClass('cmeta');
    expect(screen.getByRole('button', { name: /: 1 award, show which$/ })).toHaveTextContent(/🏆\s*1$/);
    // Keywords sort by label and toggle the keyword filter, like the collection's pills.
    const pills = screen.getAllByRole('button', { pressed: false }).filter((b) => b.classList.contains('kw-pill'));
    expect(pills.map((p) => p.textContent)).toEqual(['Card Game', 'Strategy']);
    fireEvent.click(pills[1]);
    expect(screen.getByRole('status')).toHaveTextContent('strategy');
    // No wishlist-type pill and no "Wishlist" label any more.
    expect(screen.queryByText('Wishlist')).not.toBeInTheDocument();
  });

  it('uses an h4 by default and an h3 when asked, so flat lists keep heading order', () => {
    const { unmount } = renderCard();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Test Wishlist Game');
    unmount();
    renderCard({ headingLevel: 3 });
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Wishlist Game');
  });

  it('omits the play time, the players and the keyword row when the entry lacks them', () => {
    const { container } = renderCard({ item: { ...testItem, dur: '', players: '', kw: [] } });
    expect(screen.queryByText('30 min')).not.toBeInTheDocument();
    expect(screen.queryByText('2–4')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.cmeta')).toHaveLength(0);
    expect(container.querySelector('.card-kw')).toBeNull();
  });

  it('shows box art in the collection card\'s corner when the entry has some, and reclaims the space otherwise', () => {
    const { container, unmount } = renderCard({ item: { ...testItem, img: '/images/wishlist/x.jpg' } });
    expect(screen.getByRole('img', { name: 'Test Wishlist Game box art' })).toHaveClass('card-corner-img');
    expect(container.querySelector('.card-head')).not.toHaveClass('no-art');
    unmount();
    const second = renderCard();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(second.container.querySelector('.card-head')).toHaveClass('no-art');
  });

  it('credits the suggester under the description, and not for curated entries', () => {
    const { unmount } = renderCard({ item: { ...testItem, suggestedBy: 'Dana' } });
    expect(screen.getByText('Suggested by Dana')).toHaveClass('card-credit');
    unmount();
    renderCard();
    expect(screen.queryByText(/Suggested by/)).not.toBeInTheDocument();
  });

  it('shows the vote, fires onVote, and reflects a cast vote', () => {
    const onVote = vi.fn();
    const { unmount } = renderCard({ onVote, voteCount: 3 });
    const btn = screen.getByRole('button', { name: 'Vote for Test Wishlist Game (3 votes)' });
    expect(btn).toHaveTextContent('3');
    fireEvent.click(btn);
    expect(onVote).toHaveBeenCalledOnce();
    unmount();
    renderCard({ voted: true, voteCount: 1 });
    expect(screen.getByRole('button', { name: 'Remove your vote for Test Wishlist Game (1 vote)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables the vote button when asked', () => {
    renderCard({ disabled: true });
    expect(screen.getByRole('button', { name: /Vote for/ })).toBeDisabled();
  });

  it('opens YouTube and Amazon in a new window, and the price tracker when an ASIN is pinned', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderCard({ item: { ...testItem, asin: 'B0TESTASIN' } });
    fireEvent.click(screen.getByRole('link', { name: /YouTube/ }));
    expect(openSpy).toHaveBeenLastCalledWith(expect.stringContaining('youtube.com'), '_blank', 'noopener');
    fireEvent.click(screen.getByRole('link', { name: 'Buy Test Wishlist Game on Amazon' }));
    expect(openSpy).toHaveBeenLastCalledWith(expect.stringContaining('amazon.com'), '_blank', 'noopener');
    fireEvent.click(screen.getByRole('link', { name: /price history/ }));
    expect(openSpy).toHaveBeenLastCalledWith('https://camelcamelcamel.com/product/B0TESTASIN', '_blank', 'noopener');
  });
});
