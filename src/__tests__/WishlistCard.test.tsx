import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import WishlistCard from '../components/WishlistCard';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  source: 'curated',
  blurb: '',
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
  kw: ['strategy', 'card-game'],
  awards: [{ name: 'Spiel des Jahres', year: 2020, result: 'Winner' }],
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

  it('puts the award pill on the box art when there is some, and the vote and links on the right', () => {
    renderCard({ item: { ...testItem, img: '/images/wishlist/x.jpg' } });
    const art = screen.getByRole('img', { name: 'Test Wishlist Game box art' });
    expect(art.parentElement).toContainElement(screen.getByRole('button', { name: /1 award, show which/ }));
    expect(document.querySelector('.card-head')).toHaveClass('min-h-[calc(var(--corner-art)+40px)]');
    expect(document.querySelector('.card-foot .awards')).toBeNull();
    expect(document.querySelector('.card-foot-end')).toContainElement(screen.getByRole('button', { name: /vote/i }));
  });

  it('leads the tags with the award pill when there is no art, even with no tags', () => {
    const { container, unmount } = renderCard();
    const tags = container.querySelector('.card-kw')!;
    expect(tags.firstElementChild).toContainElement(screen.getByRole('button', { name: /1 award, show which/ }));
    unmount();
    const second = renderCard({ item: { ...testItem, kw: [] } });
    expect(second.container.querySelector('.card-kw')).toContainElement(
      screen.getByRole('button', { name: /1 award, show which/ }),
    );
  });

  it('uses an h4 by default and an h3 when asked, so flat lists keep heading order', () => {
    const { unmount } = renderCard();
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Test Wishlist Game');
    unmount();
    renderCard({ headingLevel: 3 });
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test Wishlist Game');
  });

  it("shows BoardGameGeek's difficulty beside the players and time, as a collection card does", () => {
    renderCard({ item: { ...testItem, weight: 2.23 } });
    expect(screen.getByText('Difficulty:').closest('.cmeta')).toHaveTextContent('Difficulty: Medium · 2.2');
  });

  it('omits the play time, the players and the keyword row when the entry lacks them', () => {
    const { container } = renderCard({ item: { ...testItem, dur: '', players: '', kw: [], awards: [] } });
    expect(screen.queryByText('30 min')).not.toBeInTheDocument();
    expect(screen.queryByText('2–4')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.cmeta')).toHaveLength(0);
    expect(container.querySelector('.card-kw')).toBeNull();
  });

  it("shows box art in the collection card's corner when the entry has some, and reclaims the space otherwise", () => {
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
    expect(screen.getByRole('button', { name: 'Voted for Test Wishlist Game (1 vote)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it("turns Vote compact, its name unchanged, on a footer too narrow for the owner's row", () => {
    const OriginalRO = globalThis.ResizeObserver;
    let resize: ((width: number) => void) | undefined;
    globalThis.ResizeObserver = class MockResizeObserver {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(target: Element) {
        resize = (width) =>
          this.cb(
            [{ target, contentRect: { width } } as unknown as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      renderCard({ voteCount: 14 });
      const vote = screen.getByRole('button', { name: 'Vote for Test Wishlist Game (14 votes)' });
      act(() => resize!(263));
      expect(vote).not.toHaveClass('vote-btn--compact');
      act(() => resize!(262));
      expect(vote).toHaveClass('vote-btn--compact');
      expect(vote).toHaveAccessibleName('Vote for Test Wishlist Game (14 votes)');
    } finally {
      globalThis.ResizeObserver = OriginalRO;
    }
  });

  it('disables the vote button when asked', () => {
    renderCard({ disabled: true });
    expect(screen.getByRole('button', { name: /Vote for/ })).toBeDisabled();
  });

  it('opens YouTube and an Amazon search in a new window, and links no price history', () => {
    renderCard();
    expect(screen.queryByRole('link', { name: /price history/ })).toBeNull();
    const links: [string | RegExp, unknown][] = [
      [/YouTube/, expect.stringContaining('youtube.com')],
      ['Buy Test Wishlist Game on Amazon', 'https://www.amazon.com/s?k=Test%20Wishlist%20Game%20board%20game'],
    ];
    for (const [name, href] of links) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });
});

describe('WishlistCard More', () => {
  const long = {
    ...testItem,
    desc: 'Draft tiles to build a palace. Score walls, gardens and towers. Ends after the fourth season.',
  };

  it('opens on the first sentence and More shows the rest', () => {
    renderCard({ item: long });
    const more = screen.getByRole('button', { name: 'More about Test Wishlist Game' });
    const desc = more.closest('.card-desc')!;
    expect(desc).toHaveTextContent(/^Draft tiles to build a palace\. More$/);
    expect(more).toHaveAttribute('aria-controls', desc.id);

    fireEvent.click(more);
    expect(desc).toHaveTextContent(/Ends after the fourth season\. Less$/);
    expect(screen.getByRole('button', { name: 'Less about Test Wishlist Game' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('has no More when the blurb is one sentence', () => {
    renderCard();
    expect(screen.getByText('A great game to add.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^More about/ })).not.toBeInTheDocument();
  });
});
