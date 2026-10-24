import { Fragment, type ReactNode } from 'react';
import type { ItemGroup } from '../utils/filterGames';

interface Props<T, K extends string> {
  groups: ItemGroup<T, K>[];
  /** Each group's heading. */
  labels: Record<K, string>;
  /** The table's column count, for the heading row to span. */
  columns: number;
  row: (item: T) => ReactNode;
}

/**
 * A table body's rows, group by group: each group under a heading row
 * across the table, the flat list (a null key) with none. The collection
 * and the wishlist tables share it.
 */
export default function GroupedRows<T, K extends string>({ groups, labels, columns, row }: Props<T, K>) {
  return groups.map(({ key, items }) => (
    <Fragment key={key ?? 'all'}>
      {key && (
        <tr className="list-group-row group/heading">
          <td
            colSpan={columns}
            className="border-y border-border bg-bg2 px-3.5 py-1.75 text-[9.5px] font-semibold tracking-[2px] text-text3 uppercase group-first/heading:border-t-0 sm:px-5 sm:pt-2 sm:pb-1.25"
          >
            {labels[key]}
          </td>
        </tr>
      )}
      {items.map(row)}
    </Fragment>
  ));
}
