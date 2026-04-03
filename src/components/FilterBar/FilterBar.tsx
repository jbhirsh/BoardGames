import { useState, useRef } from 'react';
import { useStickyOffset } from '../../hooks/useStickyOffset';
import DurationDropdown from './DurationDropdown';
import PlayersDropdown from './PlayersDropdown';
import KeywordsDropdown from './KeywordsDropdown';
import SortDropdown from './SortDropdown';
import SearchInput from './SearchInput';

type OpenDD = 'duration' | 'players' | 'keywords' | 'sort' | null;

export default function FilterBar() {
  const [openDD, setOpenDD] = useState<OpenDD>(null);
  const ref = useRef<HTMLDivElement>(null);
  useStickyOffset(ref);

  function toggle(id: OpenDD) {
    setOpenDD((prev) => (prev === id ? null : id));
  }

  return (
    <div className="filterbar" ref={ref}>
      <DurationDropdown isOpen={openDD === 'duration'} onToggle={() => toggle('duration')} />
      <PlayersDropdown isOpen={openDD === 'players'} onToggle={() => toggle('players')} />
      <KeywordsDropdown isOpen={openDD === 'keywords'} onToggle={() => toggle('keywords')} />
      <SortDropdown isOpen={openDD === 'sort'} onToggle={() => toggle('sort')} />
      <SearchInput />
    </div>
  );
}
