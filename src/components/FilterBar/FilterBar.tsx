import { useState } from 'react';
import DurationDropdown from './DurationDropdown';
import PlayersDropdown from './PlayersDropdown';
import KeywordsDropdown from './KeywordsDropdown';
import SortDropdown from './SortDropdown';
import SearchInput from './SearchInput';
import FilterSheet from './FilterSheet';
import { useIsPhone } from '../../hooks/useIsPhone';

type OpenDD = 'duration' | 'players' | 'keywords' | 'sort' | null;

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
      <div className="filterbar">
        <SearchInput />
        <FilterSheet />
      </div>
    );
  }

  return (
    <div className="filterbar">
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
