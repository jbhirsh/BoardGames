import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ExternalLink from '../components/ExternalLink';

describe('ExternalLink', () => {
  it('is a plain link to a new tab that gets no opener and no referrer', () => {
    render(<ExternalLink href="https://example.com/video" className="row-yt" aria-label="Watch it" title="Watch Tutorial">Video</ExternalLink>);
    const link = screen.getByRole('link', { name: 'Watch it' });
    expect(link).toHaveAttribute('href', 'https://example.com/video');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    expect(link).toHaveClass('row-yt');
    expect(link).toHaveAttribute('title', 'Watch Tutorial');
    expect(link).toHaveTextContent('Video');
  });

  it('leaves the click to the browser but keeps it from toggling the row it sits in', () => {
    // A listener above the React root stands in for the clickable row and
    // sees whatever leaks past the link.
    const onRowClick = vi.fn();
    document.addEventListener('click', onRowClick);
    render(<ExternalLink href="#video">Video</ExternalLink>);
    // Not prevented: the browser opens the link itself, in a new tab.
    expect(fireEvent.click(screen.getByRole('link', { name: 'Video' }))).toBe(true);
    expect(onRowClick).not.toHaveBeenCalled();
    document.removeEventListener('click', onRowClick);
  });
});
