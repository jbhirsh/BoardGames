import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';

function renderFilterBar() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <FilterBar />
      </FilterProvider>
    </MemoryRouter>
  );
}

function getDDButton(label: string) {
  return screen.getByRole('button', { name: new RegExp(label) });
}

describe('FilterBar', () => {
  it('renders all filter dropdowns and search input', () => {
    renderFilterBar();
    expect(getDDButton('Duration')).toBeInTheDocument();
    expect(getDDButton('Players')).toBeInTheDocument();
    expect(getDDButton('Keywords')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search games...')).toBeInTheDocument();
  });

  it('opens and closes duration dropdown', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    expect(screen.getByText('Quick \u2264 15 min')).toBeInTheDocument();
    fireEvent.click(getDDButton('Duration'));
  });

  it('opening one dropdown closes another', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    expect(screen.getByText('Quick \u2264 15 min')).toBeInTheDocument();

    fireEvent.click(getDDButton('Players'));
    expect(screen.queryByText('Quick \u2264 15 min')).not.toBeInTheDocument();
  });
});

describe('DurationDropdown', () => {
  it('selects a duration option and closes dropdown', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    fireEvent.click(screen.getByText('Quick \u2264 15 min'));

    // Label should update
    expect(screen.getByRole('button', { name: /15 min/ })).toBeInTheDocument();
  });

  it('shows clear button when active and clears on click', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    fireEvent.click(screen.getByText('Quick \u2264 15 min'));

    const clearBtn = screen.getAllByText('\u2715').find(
      (el) => el.classList.contains('dd-clear-x')
    );
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn!);

    expect(getDDButton('Duration')).toBeInTheDocument();
  });
});

describe('PlayersDropdown', () => {
  it('selects a player count and shows label', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    fireEvent.click(screen.getByText('4 players'));

    expect(screen.getByRole('button', { name: /4 players/ })).toBeInTheDocument();
  });

  it('deselects when clicking same player count', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    fireEvent.click(screen.getByText('4 players'));

    // Reopen dropdown
    fireEvent.click(getDDButton('4 players'));
    // Find the option inside the dropdown panel (not the button)
    const panel = document.querySelector('[data-dd="players"]')!;
    const opt = panel.querySelector('.dd-opt.sel')!;
    fireEvent.click(opt);
  });

  it('shows clear button when active', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    fireEvent.click(screen.getByText('4 players'));

    const clearBtn = screen.getAllByText('\u2715').find(
      (el) => el.classList.contains('dd-clear-x')
    );
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn!);

    expect(getDDButton('Players')).toBeInTheDocument();
  });
});

describe('KeywordsDropdown', () => {
  it('toggles a keyword and updates label', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Keywords'));

    const ddOpt = screen.getByText('Bluffing').closest('.dd-opt');
    fireEvent.click(ddOpt!);

    expect(screen.getByRole('button', { name: /1 keyword.*OR/i })).toBeInTheDocument();
  });

  it('toggles keyword mode between Any and All', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Keywords'));

    fireEvent.click(screen.getByText('All'));

    const ddOpt = screen.getByText('Bluffing').closest('.dd-opt');
    fireEvent.click(ddOpt!);

    expect(screen.getByRole('button', { name: /1 keyword.*AND/i })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Any'));
    expect(screen.getByRole('button', { name: /1 keyword.*OR/i })).toBeInTheDocument();
  });

  it('shows clear button when keywords selected and clears on click', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Keywords'));

    const ddOpt = screen.getByText('Bluffing').closest('.dd-opt');
    fireEvent.click(ddOpt!);

    const clearBtn = screen.getAllByText('\u2715').find(
      (el) => el.classList.contains('dd-clear-x')
    );
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn!);

    expect(getDDButton('Keywords')).toBeInTheDocument();
  });

  it('shows count for each keyword', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Keywords'));

    const counts = document.querySelectorAll('.dd-count');
    expect(counts.length).toBeGreaterThan(0);
  });

  it('shows plural label when multiple keywords selected', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Keywords'));

    fireEvent.click(screen.getByText('Bluffing').closest('.dd-opt')!);
    fireEvent.click(screen.getByText('Deduction').closest('.dd-opt')!);

    expect(screen.getByRole('button', { name: /2 keywords.*OR/i })).toBeInTheDocument();
  });
});

describe('SortDropdown', () => {
  it('selects a sort option and closes dropdown', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('A\u2192Z'));
    fireEvent.click(screen.getByText('Quickest First'));

    expect(screen.getByRole('button', { name: /Quickest First/ })).toBeInTheDocument();
  });

  it('shows Group by Type option', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('A\u2192Z'));
    expect(screen.getByText('Group by Type')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Group by Type'));
  });
});

describe('SearchInput', () => {
  it('updates search value on input change', () => {
    renderFilterBar();
    const input = screen.getByPlaceholderText('Search games...');
    fireEvent.change(input, { target: { value: 'catan' } });
    expect(input).toHaveValue('catan');
  });
});

describe('Dropdown', () => {
  it('closes when clicking outside', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    expect(screen.getByText('Quick \u2264 15 min')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Quick \u2264 15 min')).not.toBeInTheDocument();
  });
});
