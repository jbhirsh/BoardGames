import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';
import { GAMES } from '../data/games';
import { WISHLIST } from '../data/wishlist';

function renderFilterBar(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
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

  it('opts the search field out of iOS autocorrect', () => {
    renderFilterBar();
    const input = screen.getByPlaceholderText('Search games...');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveAttribute('enterkeyhint', 'search');
  });

  it('opens and closes duration dropdown', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    expect(screen.getByText('Up to 15 min')).toBeInTheDocument();
    fireEvent.click(getDDButton('Duration'));
  });

  it('opening one dropdown closes another', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    expect(screen.getByText('Up to 15 min')).toBeInTheDocument();

    fireEvent.click(getDDButton('Players'));
    expect(screen.queryByText('Up to 15 min')).not.toBeInTheDocument();
  });
});

describe('DurationDropdown', () => {
  it('selects a duration option and closes dropdown', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    fireEvent.click(screen.getByText('Up to 15 min'));

    // Label should update
    expect(screen.getByRole('button', { name: /15 min/ })).toBeInTheDocument();
  });

  it('offers time budgets as one choice out of several', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Duration'));
    const group = screen.getByRole('radiogroup', { name: 'Time available' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Any length', 'Up to 15 min', 'Up to 30 min', 'Up to 60 min',
    ]);
    expect(within(group).getByRole('radio', { name: 'Any length' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(group).getByRole('radio', { name: 'Up to 60 min' }));
    fireEvent.click(getDDButton('Up to 60 min'));
    expect(screen.getByRole('radio', { name: 'Up to 60 min' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Any length' })).toHaveAttribute('aria-checked', 'false');

    // Any length takes the budget off again.
    fireEvent.click(screen.getByRole('radio', { name: 'Any length' }));
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

  it('offers one to ten players as radios, solo play included', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    const group = screen.getByRole('radiogroup', { name: 'Players' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Any number', '1 player', '2 players', '3 players', '4 players', '5 players',
      '6 players', '7 players', '8 players', '9 players', '10+ players',
    ]);

    fireEvent.click(within(group).getByRole('radio', { name: '1 player' }));
    expect(getDDButton('1 player')).toBeInTheDocument();
  });

  it('is one Tab stop, on the chosen count, and the arrow keys move between counts', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    const radios = within(screen.getByRole('radiogroup', { name: 'Players' })).getAllByRole('radio');
    // Nothing chosen: the first option takes the Tab stop.
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);

    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: 'ArrowDown' });
    expect(radios[1]).toHaveFocus();
    fireEvent.keyDown(radios[1], { key: 'ArrowRight' });
    expect(radios[2]).toHaveFocus();
    fireEvent.keyDown(radios[2], { key: 'ArrowUp' });
    expect(radios[1]).toHaveFocus();
    fireEvent.keyDown(radios[1], { key: 'ArrowLeft' });
    expect(radios[0]).toHaveFocus();
    // Past either end wraps around.
    fireEvent.keyDown(radios[0], { key: 'ArrowUp' });
    expect(radios[10]).toHaveFocus();
    fireEvent.keyDown(radios[10], { key: 'ArrowDown' });
    expect(radios[0]).toHaveFocus();
    fireEvent.keyDown(radios[0], { key: 'End' });
    expect(radios[10]).toHaveFocus();
    fireEvent.keyDown(radios[10], { key: 'Home' });
    expect(radios[0]).toHaveFocus();
    // Moving doesn't pick; other keys do nothing here.
    fireEvent.keyDown(radios[0], { key: 'a' });
    expect(radios[0]).toHaveFocus();
    expect(getDDButton('Players')).toBeInTheDocument();
  });

  it('puts the Tab stop on the chosen count', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    fireEvent.click(screen.getByText('3 players'));
    fireEvent.click(getDDButton('3 players'));
    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.tabIndex === 0).map((r) => r.textContent)).toEqual(['3 players']);
  });

  it('marks the chosen count and clears it with Any number', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    fireEvent.click(screen.getByText('9 players'));

    fireEvent.click(getDDButton('9 players'));
    expect(screen.getByRole('radio', { name: '9 players' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '4 players' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('radio', { name: 'Any number' }));
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

  it('shows count for each keyword', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Keywords'));

    const counts = document.querySelectorAll('.dd-opt-ct');
    expect(counts.length).toBeGreaterThan(0);
  });

  it('counts against the list the toggle is showing', () => {
    const shown = () => {
      const opt = screen.getByText('Strategy').closest('.dd-opt')!;
      return Number(opt.querySelector('.dd-opt-ct')!.textContent);
    };
    const owned = GAMES.filter((g) => g.kw.includes('strategy')).length;
    const wanted = WISHLIST.filter((w) => w.kw.includes('strategy')).length;
    expect(owned).not.toBe(wanted);

    renderFilterBar();
    fireEvent.click(getDDButton('Keywords'));
    expect(shown()).toBe(owned);
    cleanup();

    renderFilterBar('/?c=want');
    fireEvent.click(getDDButton('Keywords'));
    expect(shown()).toBe(wanted);
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
    expect(screen.getByText('Up to 15 min')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText('Up to 15 min')).not.toBeInTheDocument();
  });
});

describe('Dropdown accessibility', () => {
  it('says whether its panel is open and which element it is', () => {
    renderFilterBar();
    const pill = getDDButton('Players');
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(pill).not.toHaveAttribute('aria-controls');
    fireEvent.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(pill.getAttribute('aria-controls')!)).toHaveAttribute('data-dd', 'players');
  });

  it('closes on Escape and hands focus back to its pill', () => {
    renderFilterBar();
    const pill = getDDButton('Players');
    fireEvent.click(pill);
    expect(document.querySelector('[data-dd="players"]')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-dd="players"]')).toBeNull();
    expect(pill).toHaveFocus();
  });

  it('shuts when focus moves outside it, but not within it', () => {
    renderFilterBar();
    const pill = getDDButton('Players');
    fireEvent.click(pill);
    const option = screen.getByText('4 players');
    fireEvent.blur(pill, { relatedTarget: option });
    expect(document.querySelector('[data-dd="players"]')).not.toBeNull();
    fireEvent.blur(pill, { relatedTarget: getDDButton('Keywords') });
    expect(document.querySelector('[data-dd="players"]')).toBeNull();
  });

  it('ignores other keys while open', () => {
    renderFilterBar();
    fireEvent.click(getDDButton('Players'));
    fireEvent.keyDown(document, { key: 'a' });
    expect(document.querySelector('[data-dd="players"]')).not.toBeNull();
  });
});

