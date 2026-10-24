import { useState } from 'react';
import DurationDropdown from './DurationDropdown';
import PlayersDropdown from './PlayersDropdown';
import KeywordsDropdown from './KeywordsDropdown';
import SortDropdown from './SortDropdown';
import SearchInput from './SearchInput';
import FilterSheet from './FilterSheet';
import { useIsPhone } from '../../hooks/useIsPhone';

type OpenDD = 'duration' | 'players' | 'keywords' | 'sort' | null;

/**
 * The sticky filter bar both lists share. Its choices are drawn once
 * (FilterOptions.tsx) for two homes: dropdown pills on a wide screen, and
 * at phone width (520px and under, useIsPhone) a "Filters · N" button
 * beside the search that opens a bottom sheet (FilterSheet), so the bar
 * stays one row; there the active tags scroll away with the page (App.tsx).
 * The single-choice dropdowns are radio groups (RadioOptions); players run
 * 1 to 10+.
 */
export default function FilterBar() {
  const [openDD, setOpenDD] = useState<OpenDD>(null);
  const isPhone = useIsPhone();

  function toggle(id: OpenDD) {
    setOpenDD((prev) => (prev === id ? null : id));
  }

  // On a phone the pills wrapped onto two rows of a sticky bar; there, one
  // button opens a sheet holding all of them.
  if (isPhone) {
    return (
      <div className="filterbar relative flex flex-nowrap items-center gap-2 border-b border-border bg-bg px-gutter py-2 sm:static sm:flex-wrap sm:py-2.5">
        <SearchInput />
        <FilterSheet />
      </div>
    );
  }

  return (
    <div className="filterbar relative flex flex-nowrap items-center gap-2 border-b border-border bg-bg px-gutter py-2 sm:static sm:flex-wrap sm:py-2.5">
      {/* Search leads: it is the fastest way to a known game, and the pills
          read as refinements beneath it. */}
      <SearchInput />
      <DurationDropdown isOpen={openDD === 'duration'} onToggle={() => toggle('duration')} />
      <PlayersDropdown isOpen={openDD === 'players'} onToggle={() => toggle('players')} />
      <KeywordsDropdown isOpen={openDD === 'keywords'} onToggle={() => toggle('keywords')} />
      <SortDropdown isOpen={openDD === 'sort'} onToggle={() => toggle('sort')} />
    </div>
  );
}
