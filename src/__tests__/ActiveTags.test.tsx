import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ActiveTags from '../components/ActiveTags';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';

function renderActiveTags() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <FilterBar />
        <ActiveTags />
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('ActiveTags', () => {
  it('is hidden when no filters are active', () => {
    const { container } = render(
      <MemoryRouter>
        <FilterProvider>
          <ActiveTags />
        </FilterProvider>
      </MemoryRouter>
    );
    const tags = container.querySelector('.atags');
    expect(tags).not.toHaveClass('show');
  });

  it('shows a duration tag when a duration filter is set and clears on click', () => {
    renderActiveTags();

    // Open the duration dropdown
    const durationBtn = screen.getByRole('button', { name: /Duration/ });
    fireEvent.click(durationBtn);
    fireEvent.click(screen.getByText('Quick \u2264 15 min'));

    // The active tag should appear
    const tag = screen.getByText(/\u2264 15 min.*\u2715/);
    expect(tag).toHaveClass('atag');

    // Click to clear
    fireEvent.click(tag);
  });

  it('shows a players tag when a player filter is set and clears on click', () => {
    renderActiveTags();

    const playersBtn = screen.getByRole('button', { name: /Players/ });
    fireEvent.click(playersBtn);
    fireEvent.click(screen.getByText('4 players'));

    const tag = screen.getByRole('button', { name: /4 players.*\u2715/ });
    expect(tag).toHaveClass('atag');
    fireEvent.click(tag);
  });

  it('shows keyword tags when keywords are selected and removes on click', () => {
    renderActiveTags();

    const kwBtn = screen.getByRole('button', { name: /Keywords/ });
    fireEvent.click(kwBtn);

    // Click a keyword in the dropdown
    const ddOpt = screen.getByText('Bluffing').closest('.dd-opt');
    fireEvent.click(ddOpt!);

    // An atag for the keyword should exist
    const activeTag = screen.getByRole('button', { name: /Bluffing.*\u2715/ });
    expect(activeTag).toHaveClass('atag');
    fireEvent.click(activeTag);
  });

  it('shows a search tag and clears on click', () => {
    renderActiveTags();

    const input = screen.getByPlaceholderText('Search games...');
    fireEvent.change(input, { target: { value: 'test' } });

    const tag = screen.getByRole('button', { name: /test.*\u2715/ });
    expect(tag).toHaveClass('atag');

    fireEvent.click(tag);
    expect(input).toHaveValue('');
  });

  it('shows Clear all button and clears everything', () => {
    renderActiveTags();

    const durationBtn = screen.getByRole('button', { name: /Duration/ });
    fireEvent.click(durationBtn);
    fireEvent.click(screen.getByText('Quick \u2264 15 min'));

    const clearAll = screen.getByText('Clear all');
    expect(clearAll).toBeInTheDocument();
    fireEvent.click(clearAll);
  });

  describe('share link', () => {
    let writeText: ReturnType<typeof vi.fn>;
    let originalClipboard: PropertyDescriptor | undefined;

    beforeEach(() => {
      writeText = vi.fn().mockResolvedValue(undefined);
      originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
    });

    afterEach(() => {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      } else {
        Reflect.deleteProperty(navigator as object, 'clipboard');
      }
    });

    it('is hidden when no filters are active', () => {
      renderActiveTags();
      expect(screen.queryByText('Share link')).toBeNull();
    });

    it('copies a URL containing the active filters', async () => {
      renderActiveTags();

      const playersBtn = screen.getByRole('button', { name: /Players/ });
      fireEvent.click(playersBtn);
      fireEvent.click(screen.getByText('5 players'));

      const share = screen.getByRole('button', { name: /Share link/ });
      await act(async () => {
        fireEvent.click(share);
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      const url = writeText.mock.calls[0][0] as string;
      expect(url).toContain('p=5');
      await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument());
      // The sibling live region should announce the copy to screen readers
      // even if focus doesn't move off the button.
      expect(screen.getByText('Link copied to clipboard')).toBeInTheDocument();
    });

    it('fails silently if clipboard rejects (no announcement, no exception)', async () => {
      writeText.mockRejectedValueOnce(new Error('denied'));

      renderActiveTags();
      const playersBtn = screen.getByRole('button', { name: /Players/ });
      fireEvent.click(playersBtn);
      fireEvent.click(screen.getByText('4 players'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Share link/ }));
      });

      // Label stays as "Share link" and the live region remains empty.
      expect(screen.getByRole('button', { name: /Share link/ })).toHaveTextContent('Share link');
      expect(screen.queryByText('Link copied to clipboard')).toBeNull();
    });
  });
});
