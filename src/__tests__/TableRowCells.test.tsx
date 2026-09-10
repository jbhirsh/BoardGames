import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ComponentProps } from 'react';
import TableRowCells, { TableRowExpand } from '../components/TableRowCells';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';

type Props = ComponentProps<typeof TableRowCells>;

const base: Props = {
  name: 'Cell Game',
  players: '2–5',
  cat: 'long',
  dur: '90 min',
  short: 'A game of cells.',
  kw: ['strategy', 'abstract'],
  awards: [],
  isOpen: false,
  onToggle: () => {},
};

function FilterProbe() {
  const { state } = useFilter();
  return <output>{`${state.duration}|${[...state.keywords].join(',')}`}</output>;
}

function renderCells(overrides: Partial<Props> = {}, onRowClick = vi.fn()) {
  const utils = render(
    <MemoryRouter>
      <FilterProvider>
        <table>
          <tbody>
            <tr onClick={onRowClick}>
              <TableRowCells {...base} {...overrides} />
            </tr>
          </tbody>
        </table>
        <FilterProbe />
      </FilterProvider>
    </MemoryRouter>,
  );
  return { ...utils, row: utils.container.querySelector('tr')!, onRowClick };
}

describe('TableRowCells', () => {
  it('renders the shared cells in header order with the table classes', () => {
    const { row } = renderCells({ awards: [{ name: 'Spiel des Jahres', year: 2020 }] });
    const cells = Array.from(row.children).map((td) => td.className);
    expect(cells).toEqual([
      'col-name',
      'col-hide col-players-h col-players',
      '',
      'col-hide col-short',
      'col-hide col-tags col-kw',
      'col-actions',
    ]);
    expect(row.querySelector('td.col-name .col-name-wrap .col-name')).toHaveTextContent('Cell Game');
    expect(row.querySelector('.col-name-wrap .mobile-short')).toHaveTextContent('A game of cells.');
    expect(row.querySelector('.col-name-wrap .awards')).toHaveTextContent('1 award');
    expect(row.querySelector('td.col-players')).toHaveTextContent('2–5');
    expect(row.querySelector('.row-dur')).toHaveClass('dur-long');
    expect(row.querySelector('.row-dur')).toHaveTextContent('Long');
    expect(row.querySelector('td.col-short')).toHaveTextContent('A game of cells.');
    expect(Array.from(row.querySelectorAll('.col-kw .kw-pill')).map((p) => p.textContent)).toEqual(['Abstract', 'Strategy']);
    expect(row.querySelector('.col-actions .row-toggle .row-chevron')).toBeInTheDocument();
  });

  it('shows the group badge only when one is given', () => {
    const { row, unmount } = renderCells();
    expect(row.querySelector('.group-badge')).toBeNull();
    expect(row.querySelector('.awards')).toBeNull();
    unmount();
    const second = renderCells({ groupBadge: 'strat' });
    const badge = second.row.querySelector('.col-name-wrap .group-badge')!;
    expect(badge).toHaveTextContent('strat');
    // The badge sits between the name and the mobile description.
    expect(badge.previousElementSibling).toHaveClass('col-name');
    expect(badge.nextElementSibling).toHaveClass('mobile-short');
  });

  it('leaves the duration cell empty when the play time is unknown', () => {
    const { row } = renderCells({ dur: '' });
    const durCell = row.children[2];
    expect(durCell).toBeEmptyDOMElement();
    expect(row.querySelector('.row-dur')).toBeNull();
  });

  it('slots the extra cell in just before the actions cell', () => {
    const { row } = renderCells({ extra: <td className="col-vote">7</td> });
    const classes = Array.from(row.children).map((td) => td.className);
    expect(classes.slice(-2)).toEqual(['col-vote', 'col-actions']);
    expect(row.children).toHaveLength(7);
    expect(row.querySelector('.col-vote')).toHaveTextContent('7');
  });

  it('labels the chevron for the open state and toggles once without bubbling to the row', () => {
    const onToggle = vi.fn();
    const { row, onRowClick, unmount } = renderCells({ onToggle });
    const chevron = screen.getByRole('button', { name: 'Show details for Cell Game' });
    expect(chevron).toHaveAttribute('type', 'button');
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(chevron);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
    unmount();

    renderCells({ isOpen: true });
    expect(screen.getByRole('button', { name: 'Hide details for Cell Game' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('filters by duration and keyword from the pills without toggling the row', () => {
    const { onRowClick } = renderCells();
    expect(screen.getByRole('status')).toHaveTextContent('all|');
    fireEvent.click(screen.getByText('Long'));
    expect(screen.getByRole('status')).toHaveTextContent('long|');
    const strategy = screen.getByText('Strategy');
    expect(strategy).not.toHaveClass('lit');
    fireEvent.click(strategy);
    expect(screen.getByRole('status')).toHaveTextContent('long|strategy');
    expect(screen.getByText('Strategy')).toHaveClass('lit');
    expect(screen.getByText('Abstract')).not.toHaveClass('lit');
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('TableRowExpand', () => {
  function renderExpand(isOpen: boolean, colSpan = 6) {
    return render(
      <table>
        <tbody>
          <TableRowExpand colSpan={colSpan} isOpen={isOpen}>
            <p>Details</p>
          </TableRowExpand>
        </tbody>
      </table>,
    );
  }

  it('spans the given columns and nests the content in the expand wrappers', () => {
    const { container } = renderExpand(true, 7);
    const row = container.querySelector('tr.row-expand')!;
    const cell = row.querySelector('td')!;
    expect(cell).toHaveAttribute('colspan', '7');
    expect(cell).toHaveStyle({ padding: '0' });
    expect(cell.querySelector('.row-expand-inner > .row-expand-content > p')).toHaveTextContent('Details');
  });

  it('is inert while closed and live once open', () => {
    const { container, unmount } = renderExpand(false);
    expect(container.querySelector('.row-expand-inner')).toHaveAttribute('inert');
    unmount();
    const open = renderExpand(true);
    expect(open.container.querySelector('.row-expand-inner')).not.toHaveAttribute('inert');
  });
});
