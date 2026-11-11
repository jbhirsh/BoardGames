import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PreviewCard from '../components/PreviewCard';
import type { PreviewDetails } from '../utils/lookupNotice';

const details = (desc: string): PreviewDetails => ({
  bggId: 162886,
  name: 'Spirit Island',
  year: 2017,
  min: 1,
  max: 4,
  mins: 120,
  desc,
  kw: ['strategy'],
});

const LONG = 'Magic still exists in the distant reaches. Spirits defend the island. Invaders arrive.';

describe('PreviewCard', () => {
  it("opens on the description's first sentence, and More shows the rest", () => {
    render(<PreviewCard details={details(LONG)} />);
    expect(screen.getByText(/Magic still exists in the distant reaches\./)).not.toHaveTextContent('Invaders');
    const more = screen.getByRole('button', { name: 'More about Spirit Island' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(screen.getByText(/Invaders arrive\./)).toBeInTheDocument();
    const less = screen.getByRole('button', { name: 'Less about Spirit Island' });
    expect(less).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(less);
    expect(screen.queryByText(/Invaders arrive\./)).toBeNull();
  });

  it('shows a one-sentence description whole, with no More', () => {
    render(<PreviewCard details={details('Defend the island.')} />);
    expect(screen.getByText('Defend the island.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows no description when BoardGameGeek has none', () => {
    render(<PreviewCard details={details('')} />);
    expect(screen.getByText('Spirit Island')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
