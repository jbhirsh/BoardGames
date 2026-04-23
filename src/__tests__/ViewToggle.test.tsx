import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import ViewToggle from '../components/ViewToggle';
import { FilterProvider } from '../context/FilterContext';

function renderViewToggle() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <ViewToggle />
      </FilterProvider>
    </MemoryRouter>
  );
}

describe('ViewToggle', () => {
  it('renders grid and list buttons', () => {
    renderViewToggle();
    expect(screen.getByLabelText('Grid view')).toBeInTheDocument();
    expect(screen.getByLabelText('List view')).toBeInTheDocument();
  });

  it('list view is active by default', () => {
    renderViewToggle();
    expect(screen.getByLabelText('List view')).toHaveClass('active');
    expect(screen.getByLabelText('Grid view')).not.toHaveClass('active');
  });

  it('clicking grid button switches to grid view', () => {
    renderViewToggle();
    fireEvent.click(screen.getByLabelText('Grid view'));
    expect(screen.getByLabelText('Grid view')).toHaveClass('active');
    expect(screen.getByLabelText('List view')).not.toHaveClass('active');
  });

  it('clicking list button switches back to list view', () => {
    renderViewToggle();
    fireEvent.click(screen.getByLabelText('Grid view'));
    fireEvent.click(screen.getByLabelText('List view'));
    expect(screen.getByLabelText('List view')).toHaveClass('active');
  });
});
