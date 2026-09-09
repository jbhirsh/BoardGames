import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import WishlistRow from '../components/WishlistRow';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';
import type { WishlistItem } from '../data/types';

const testItem: WishlistItem = {
  id: 'test-row-game',
  name: 'Row Game',
  desc: 'A row of a game.',
  yt: 'row game review',
  players: '3–8',
  type: 'party',
  min: 3,
  max: 8,
  dur: '20 min',
  mins: 20,
  cat: 'medium',
  kw: ['party', 'bluffing'],
  awards: [],
};

type Props = React.ComponentProps<typeof WishlistRow>;

function FilterProbe() {
  const { state } = useFilter();
  return <output>{`${state.duration}|${[...state.keywords].join(',')}`}</output>;
}

function renderRow(overrides: Partial<Props> = {}) {
  const props: Props = { item: testItem, voteCount: 0, voted: false, onVote: () => {}, isOpen: false, onToggle: () => {}, ...overrides };
  return render(
    <MemoryRouter>
      <FilterProvider>
        <table><tbody><WishlistRow {...props} /></tbody></table>
        <FilterProbe />
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('WishlistRow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is the collection\'s table row: name, players, duration pill, description, tags, vote and chevron', () => {
    const { container } = renderRow({ voteCount: 4 });
    const row = container.querySelector('tr.game-row')!;
    expect(row).toHaveAttribute('data-item-id', 'test-row-game');
    expect(row.querySelector('.col-name-wrap .col-name')).toHaveTextContent('Row Game');
    expect(row.querySelector('.mobile-short')).toHaveTextContent('A row of a game.');
    expect(row.querySelector('td.col-players')).toHaveTextContent('3–8');
    expect(row.querySelector('.row-dur')).toHaveTextContent('Medium');
    expect(row.querySelector('td.col-short')).toHaveTextContent('A row of a game.');
    expect(Array.from(row.querySelectorAll('.col-kw .kw-pill')).map((p) => p.textContent)).toEqual(['Bluffing', 'Party']);
    expect(row.querySelector('.col-vote .vote-btn')).toHaveTextContent('4');
    expect(row.querySelector('.col-actions .row-chevron')).toBeInTheDocument();
    expect(row.querySelector('.awards')).toBeNull();
  });

  it('toggles the row on click, but not from the vote button, the duration pill or a keyword', () => {
    const onToggle = vi.fn();
    const onVote = vi.fn();
    const { container } = renderRow({ onToggle, onVote });
    fireEvent.click(container.querySelector('tr.game-row')!);
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Vote for Row Game/ }));
    expect(onVote).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Medium'));
    fireEvent.click(screen.getByText('Party'));
    expect(screen.getByRole('status')).toHaveTextContent('medium|party');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks an open row and shows the full entry in the expanded section', () => {
    const item = { ...testItem, img: '/images/wishlist/r.jpg', suggestedBy: 'Alex', awards: [{ name: 'As d\'Or', year: 2021 }] };
    const { container } = renderRow({ item, isOpen: true });
    expect(container.querySelector('tr.game-row')).toHaveClass('open');
    const expand = container.querySelector('tr.row-expand')!;
    expect(expand.querySelector('.row-art')).toHaveAttribute('src', '/images/wishlist/r.jpg');
    expect(expand.querySelector('.row-credit')).toHaveTextContent('Suggested by Alex');
    expect(expand.querySelector('.row-awards h3')).toHaveTextContent('Awards');
    expect(expand.querySelectorAll('.awards-list li')).toHaveLength(1);
    expect(container.querySelector('.col-name-wrap .awards')).toHaveTextContent('1 award');
    expect(screen.getByRole('link', { name: 'Buy Row Game on Amazon' })).toHaveAttribute('href', expect.stringContaining('amazon.com'));
    expect(screen.getByRole('link', { name: /YouTube/ })).toHaveAttribute('href', expect.stringContaining('youtube.com'));
  });

  it('leaves out the duration pill for an unknown play time and the credit and awards for a curated entry', () => {
    const { container } = renderRow({ item: { ...testItem, dur: '', mins: 0 } });
    expect(container.querySelector('.row-dur')).toBeNull();
    expect(container.querySelector('.row-credit')).toBeNull();
    expect(container.querySelector('.row-awards')).toBeNull();
    expect(container.querySelector('.row-art')).toBeNull();
  });

  it('reflects a cast vote and a disabled vote', () => {
    const { unmount } = renderRow({ voted: true, voteCount: 2 });
    expect(screen.getByRole('button', { name: /Remove your vote for Row Game/ })).toHaveAttribute('aria-pressed', 'true');
    unmount();
    renderRow({ disabled: true });
    expect(screen.getByRole('button', { name: /Vote for/ })).toBeDisabled();
  });

  it('has a labelled chevron button that toggles the row once, and keeps the closed panel inert', () => {
    const onToggle = vi.fn();
    const { unmount } = renderRow({ onToggle });
    const chevron = screen.getByRole('button', { name: 'Show details for Row Game' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('.row-expand-inner')).toHaveAttribute('inert');
    fireEvent.click(chevron);
    expect(onToggle).toHaveBeenCalledTimes(1);
    unmount();
    renderRow({ isOpen: true });
    expect(screen.getByRole('button', { name: 'Hide details for Row Game' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.row-expand-inner')).not.toHaveAttribute('inert');
  });

  it('opens the links in a new window without an opener', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderRow({ item: { ...testItem, asin: 'B0TESTASIN' }, isOpen: true });
    fireEvent.click(screen.getByRole('link', { name: /YouTube/ }));
    expect(openSpy).toHaveBeenLastCalledWith(expect.stringContaining('youtube.com'), '_blank', 'noopener');
    fireEvent.click(screen.getByRole('link', { name: 'Buy Row Game on Amazon' }));
    expect(openSpy).toHaveBeenLastCalledWith('https://www.amazon.com/dp/B0TESTASIN', '_blank', 'noopener');
    fireEvent.click(screen.getByRole('link', { name: /price history/ }));
    expect(openSpy).toHaveBeenLastCalledWith('https://camelcamelcamel.com/product/B0TESTASIN', '_blank', 'noopener');
  });
});
