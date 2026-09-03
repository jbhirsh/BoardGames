import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AwardsBadge from '../components/AwardsBadge';

const awards = [
  { name: 'Spiel des Jahres', year: 2024 },
  { name: 'Golden Geek Best Two-Player Game', year: 2023 },
];

describe('AwardsBadge', () => {
  it('renders a plain label when there are no awards', () => {
    render(<AwardsBadge itemName="Nothing Yet" awards={[]} />);
    const label = screen.getByText('0 awards');
    expect(label.tagName).toBe('SPAN');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('singularises a single award', () => {
    render(<AwardsBadge itemName="One Win" awards={[awards[0]]} />);
    expect(screen.getByText(/1 award$/)).toBeInTheDocument();
  });

  it('shows the count collapsed and reveals each award on click', () => {
    render(<AwardsBadge itemName="Sky Team" awards={awards} />);
    const details = screen.getByRole('group');
    expect(details).not.toHaveAttribute('open');
    const toggle = screen.getByText(/2 awards/);
    expect(toggle.closest('summary')).toHaveAttribute('aria-label', 'Sky Team: 2 awards, show which');

    fireEvent.click(toggle);
    expect(details).toHaveAttribute('open');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Spiel des Jahres');
    expect(items[0]).toHaveTextContent('2024');
    expect(items[1]).toHaveTextContent('Golden Geek Best Two-Player Game');
  });
});
