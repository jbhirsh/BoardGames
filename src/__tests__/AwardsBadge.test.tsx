import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AwardsBadge, { AwardsCount } from '../components/AwardsBadge';

const awards = [
  { name: 'Spiel des Jahres', year: 2024 },
  { name: 'Golden Geek Best Two-Player Game', year: 2023 },
];

describe('AwardsBadge', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing at all for an entry with no wins', () => {
    const { container } = render(<><AwardsBadge itemName="Nothing Yet" awards={[]} /><AwardsCount awards={[]} /></>);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows just the trophy and the count, with the full wording for assistive tech', () => {
    render(<AwardsBadge itemName="One Win" awards={[awards[0]]} />);
    const btn = screen.getByRole('button', { name: 'One Win: 1 award, show which' });
    expect(btn).toHaveTextContent(/🏆\s*1$/);
    expect(btn).not.toHaveTextContent('award');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('opens a floating list on click, positioned from the pill, and closes on a second click', () => {
    render(<AwardsBadge itemName="Sky Team" awards={awards} />);
    const btn = screen.getByRole('button', { name: /Sky Team/ });
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 120, left: 40, right: 90, width: 50, height: 20, x: 40, y: 100, toJSON: () => ({}) } as DOMRect);
    fireEvent.click(btn);
    const pop = screen.getByRole('group');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(btn).toHaveAttribute('aria-controls', pop.id);
    expect(pop).toHaveStyle({ position: 'fixed', top: '126px', left: '40px' });
    expect(pop).toHaveTextContent('Sky Team: 2 awards');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Spiel des Jahres');
    expect(items[0]).toHaveTextContent('2024');
    expect(items[1]).toHaveTextContent('Golden Geek Best Two-Player Game');

    fireEvent.click(btn);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(btn).not.toHaveAttribute('aria-controls');
  });

  it('keeps the list on screen when the pill sits near the right edge', () => {
    render(<AwardsBadge itemName="Sky Team" awards={awards} />);
    const btn = screen.getByRole('button', { name: /Sky Team/ });
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 30, left: window.innerWidth - 30, right: window.innerWidth, width: 30, height: 20, x: 0, y: 10, toJSON: () => ({}) } as DOMRect);
    fireEvent.click(btn);
    const pop = screen.getByRole('group');
    expect(pop.style.left).toBe(`${window.innerWidth - 260 - 8}px`);
    expect(pop.style.width).toBe('260px');
  });

  it('opens above the pill when the list would run off the bottom of the screen', () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 200 });
    try {
      render(<AwardsBadge itemName="Azul" awards={awards} />);
      const btn = screen.getByRole('button');
      const near = window.innerHeight - 40;
      vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({ top: near, bottom: near + 20, left: 40, right: 90, width: 50, height: 20, x: 40, y: near, toJSON: () => ({}) } as DOMRect);
      fireEvent.click(btn);
      expect(screen.getByRole('group').style.top).toBe(`${near - 6 - 200}px`);
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', desc);
    }
  });

  it('shows on hover and hides when the pointer leaves, unless it was clicked open', () => {
    render(<AwardsBadge itemName="Sky Team" awards={awards} />);
    const btn = screen.getByRole('button', { name: /Sky Team/ });
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole('group')).toBeInTheDocument();
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();

    fireEvent.mouseEnter(btn);
    fireEvent.click(btn);
    fireEvent.mouseLeave(btn);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('closes on Escape, on a click elsewhere, and when the page scrolls', () => {
    render(<div><AwardsBadge itemName="Sky Team" awards={awards} /><p>elsewhere</p></div>);
    const btn = screen.getByRole('button', { name: /Sky Team/ });
    fireEvent.click(btn);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();

    fireEvent.click(btn);
    fireEvent.mouseDown(screen.getByText('elsewhere'));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();

    fireEvent.click(btn);
    fireEvent.mouseDown(btn);
    expect(screen.getByRole('group')).toBeInTheDocument();
    fireEvent.scroll(window);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('does not let the click reach a row behind it', () => {
    const onRow = vi.fn();
    render(<button type="button" onClick={onRow}><AwardsBadge itemName="Sky Team" awards={awards} /></button>);
    fireEvent.click(screen.getByRole('button', { name: /Sky Team/ }));
    expect(onRow).not.toHaveBeenCalled();
  });

  it('renders a static count for rows, with the wording as visually hidden text', () => {
    render(<AwardsCount awards={awards} />);
    const wording = screen.getByText('2 awards');
    expect(wording).toHaveClass('sr-only');
    const pill = wording.parentElement!;
    expect(pill.tagName).toBe('SPAN');
    expect(pill.querySelector('[aria-hidden="true"]')).toHaveTextContent(/🏆\s*2$/);
  });

  it('closes on a second tap even though touch never sends mouseleave', () => {
    render(<AwardsBadge itemName="Sky Team" awards={awards} />);
    const btn = screen.getByRole('button', { name: /Sky Team/ });
    fireEvent.mouseEnter(btn);
    fireEvent.click(btn);
    expect(screen.getByRole('group')).toBeInTheDocument();
    fireEvent.mouseEnter(btn);
    fireEvent.click(btn);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});
