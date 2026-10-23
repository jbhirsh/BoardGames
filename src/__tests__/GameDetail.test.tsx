import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameDetail from '../components/GameDetail';

const sections = [
  { heading: 'How It Works', body: 'Everyone gets a secret role.' },
  { heading: 'Why It Works', body: 'Ten minutes, then play again.' },
];

describe('GameDetail', () => {
  it('draws each section as a heading over its paragraph, side by side rather than nested', () => {
    const { container } = render(
      <div data-testid="host">
        <GameDetail sections={sections} />
      </div>,
    );
    const host = screen.getByTestId('host');
    expect([...host.children].map((el) => el.className)).toEqual(['detail-section', 'detail-section']);
    expect(container.querySelector('.detail-section .detail-section')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'How It Works',
      'Why It Works',
    ]);
    expect([...host.querySelectorAll('.detail-section > p')].map((p) => p.textContent)).toEqual([
      'Everyone gets a secret role.',
      'Ten minutes, then play again.',
    ]);
  });

  it('shows the words as text, never as markup', () => {
    render(<GameDetail sections={[{ heading: 'Tags <b>', body: '<img src=x onerror=alert(1)> & more' }]} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Tags <b>');
    expect(screen.getByText('<img src=x onerror=alert(1)> & more')).toBeInTheDocument();
    expect(document.querySelector('img, b')).toBeNull();
  });

  it('draws nothing for a write-up with no sections', () => {
    const { container } = render(<GameDetail sections={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
