import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DurationPill from '../components/DurationPill';

describe('DurationPill', () => {
  it('renders the pill label for the duration category', () => {
    render(<DurationPill cat="quick" />);
    expect(screen.getByText('Quick')).toBeInTheDocument();
  });

  it('renders as non-interactive when no onClick provided', () => {
    render(<DurationPill cat="medium" />);
    const pill = screen.getByText('Medium');
    expect(pill).not.toHaveAttribute('role');
    expect(pill).not.toHaveAttribute('tabindex');
  });

  it('renders as interactive button when onClick provided', () => {
    render(<DurationPill cat="long" onClick={() => {}} />);
    const pill = screen.getByText('Long');
    expect(pill).toHaveAttribute('role', 'button');
    expect(pill).toHaveAttribute('tabindex', '0');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<DurationPill cat="quick" onClick={onClick} />);
    fireEvent.click(screen.getByText('Quick'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Enter keypress', () => {
    const onClick = vi.fn();
    render(<DurationPill cat="quick" onClick={onClick} />);
    fireEvent.keyDown(screen.getByText('Quick'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on Space keypress', () => {
    const onClick = vi.fn();
    render(<DurationPill cat="quick" onClick={onClick} />);
    fireEvent.keyDown(screen.getByText('Quick'), { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick on other keypresses', () => {
    const onClick = vi.fn();
    render(<DurationPill cat="quick" onClick={onClick} />);
    fireEvent.keyDown(screen.getByText('Quick'), { key: 'a' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies custom className when provided', () => {
    render(<DurationPill cat="quick" className="custom-cls" />);
    const pill = screen.getByText('Quick');
    expect(pill).toHaveClass('custom-cls');
    expect(pill).toHaveClass('dur-quick');
  });
});
