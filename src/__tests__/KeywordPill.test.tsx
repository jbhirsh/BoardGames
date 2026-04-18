import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import KeywordPill from '../components/KeywordPill';

describe('KeywordPill', () => {
  it('renders the keyword label', () => {
    render(<KeywordPill keyword="strategy" />);
    expect(screen.getByText('Strategy')).toBeInTheDocument();
  });

  it('renders as non-interactive when no onClick provided', () => {
    render(<KeywordPill keyword="strategy" />);
    const pill = screen.getByText('Strategy');
    expect(pill).not.toHaveAttribute('role');
    expect(pill).not.toHaveAttribute('tabindex');
    expect(pill).not.toHaveAttribute('aria-pressed');
  });

  it('renders as interactive with aria-pressed=false when inactive', () => {
    render(<KeywordPill keyword="strategy" onClick={() => {}} />);
    const pill = screen.getByText('Strategy');
    expect(pill).toHaveAttribute('role', 'button');
    expect(pill).toHaveAttribute('tabindex', '0');
    expect(pill).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies lit class and aria-pressed=true when active', () => {
    render(<KeywordPill keyword="strategy" active onClick={() => {}} />);
    const pill = screen.getByText('Strategy');
    expect(pill).toHaveClass('lit');
    expect(pill).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<KeywordPill keyword="party" onClick={onClick} />);
    fireEvent.click(screen.getByText('Party'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Enter keypress', () => {
    const onClick = vi.fn();
    render(<KeywordPill keyword="party" onClick={onClick} />);
    fireEvent.keyDown(screen.getByText('Party'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Space keypress', () => {
    const onClick = vi.fn();
    render(<KeywordPill keyword="party" onClick={onClick} />);
    fireEvent.keyDown(screen.getByText('Party'), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick on other keypresses', () => {
    const onClick = vi.fn();
    render(<KeywordPill keyword="party" onClick={onClick} />);
    fireEvent.keyDown(screen.getByText('Party'), { key: 'Tab' });
    expect(onClick).not.toHaveBeenCalled();
  });
});
