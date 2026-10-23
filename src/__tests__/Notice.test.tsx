import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Notice from '../components/Notice';

describe('Notice', () => {
  it('says its message politely, with an icon, in its tone', () => {
    const { container } = render(<Notice tone="info">The assistant is resting for today.</Notice>);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('The assistant is resting for today.');
    expect(notice).toHaveClass('notice', 'notice-info');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('interrupts for an error', () => {
    render(<Notice tone="error">Something broke.</Notice>);
    expect(screen.getByRole('alert')).toHaveClass('notice-error');
  });

  it('leaves the announcing to a live region around it when told to', () => {
    const { container } = render(
      <>
        <Notice tone="info" live={false}>
          The assistant is resting for today.
        </Notice>
        <Notice tone="error" live={false}>
          Something broke.
        </Notice>
      </>,
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('.notice-info')).toHaveTextContent('The assistant is resting for today.');
    expect(container.querySelector('.notice-error')).not.toHaveAttribute('role');
  });

  it('offers its action as a button', () => {
    const onClick = vi.fn();
    render(
      <Notice tone="warning" action={{ label: 'Try again', onClick }}>
        Couldn't double-check.
      </Notice>,
    );
    expect(screen.getByRole('status')).toHaveClass('notice-warning');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
