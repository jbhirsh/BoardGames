import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActiveTags from '../components/ActiveTags';
import { FilterProvider } from '../context/FilterContext';

describe('ActiveTags', () => {
  it('is hidden when no filters are active', () => {
    const { container } = render(
      <FilterProvider>
        <ActiveTags />
      </FilterProvider>
    );
    const tags = container.querySelector('.atags');
    expect(tags).not.toHaveClass('show');
  });
});
