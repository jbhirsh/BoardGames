import { useFilter } from '../../context/useFilter';
import { SearchIcon } from '../Icons';

export default function SearchInput() {
  const { state, dispatch } = useFilter();

  return (
    <div className="fb-search">
      <SearchIcon />
      {/* autocorrect off so iOS does not rewrite game names mid-search */}
      <input
        type="text"
        className="fb-search-input"
        placeholder="Search games..."
        value={state.search}
        onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
    </div>
  );
}
