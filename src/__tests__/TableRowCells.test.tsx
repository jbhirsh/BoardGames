import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  mins: 90,
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

  it("shows the game's own time on the duration pill and names the budget it filters to", () => {
    renderCells({ cat: 'medium', dur: '20 min', mins: 20 });
    const pill = screen.getByRole('button', { name: '20 min: show games up to 30 min' });
    expect(pill).toHaveTextContent('20 min');
    expect(pill).toHaveClass('dur-medium');
  });

  it('leaves the pill as plain text for a game longer than every budget', () => {
    renderCells();
    expect(screen.getByText('90 min')).not.toHaveAttribute('role');
    expect(screen.queryByRole('button', { name: /90 min/ })).not.toBeInTheDocument();
  });

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
    // The award count sits on the name's line and opens the list of wins.
    // The award count closes the description, in its column and in the copy
    // folded under the name for narrow widths.
    expect(row.querySelector('td.col-short .row-badges .awards')).toContainElement(screen.getAllByRole('button', { name: 'Cell Game: 1 award, show which' })[1]);
    expect(row.querySelector('.col-name-wrap .mobile-short .row-badges .awards')).toBeInTheDocument();
    expect(row.querySelector('td.col-players')).toHaveTextContent('2–5');
    expect(row.querySelector('.row-dur')).toHaveClass('dur-long');
    expect(row.querySelector('.row-dur')).toHaveTextContent('90 min');
    expect(row.querySelector('td.col-short')).toHaveTextContent('A game of cells.');
    expect(Array.from(row.querySelectorAll('.col-kw .kw-pill')).map((p) => p.textContent)).toEqual(['Abstract', 'Strategy']);
    expect(row.querySelector('.col-actions .row-toggle .row-chevron')).toBeInTheDocument();
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

  it('holds only the chevron in the actions cell', () => {
    const { row } = renderCells();
    const cell = row.querySelector('td.col-actions')!;
    expect(Array.from(cell.children).map((el) => el.tagName)).toEqual(['BUTTON']);
    expect(within(row).queryAllByRole('link')).toHaveLength(0);
  });

  it('reads out a rated difficulty and shows no dash', () => {
    const { row } = renderCells({ difficulty: { weight: 2.3 } });
    const cell = row.querySelector('td.col-diff')!;
    expect(cell).toHaveTextContent(/^Medium · 2\.3$/);
    expect(cell.querySelector('.diff-none')).toBeNull();
    expect(screen.queryByText('Not rated on BoardGameGeek')).not.toBeInTheDocument();
  });

  it('shows a dash for a game BoardGameGeek has not rated, and says so to a screen reader', () => {
    const { row } = renderCells({ difficulty: {} });
    const cell = row.querySelector<HTMLElement>('td.col-diff')!;
    const dash = cell.querySelector('.diff-none')!;
    expect(dash).toHaveTextContent(/^–$/);
    expect(dash).toHaveAttribute('aria-hidden', 'true');
    expect(within(cell).getByText('Not rated on BoardGameGeek')).toHaveClass('sr-only');
    expect(cell).toHaveTextContent(/^–Not rated on BoardGameGeek$/);
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
    const { onRowClick } = renderCells({ cat: 'medium', dur: '45 min', mins: 45 });
    expect(screen.getByRole('status')).toHaveTextContent('all|');
    fireEvent.click(screen.getByText('45 min'));
    expect(screen.getByRole('status')).toHaveTextContent('60|');
    const strategy = screen.getByText('Strategy');
    expect(strategy).not.toHaveClass('lit');
    fireEvent.click(strategy);
    expect(screen.getByRole('status')).toHaveTextContent('60|strategy');
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
