import { useFilter } from '../../context/FilterContext';
import { SearchIcon } from '../Icons';

export default function SearchInput() {
  const { state, dispatch } = useFilter();

  return (
    <div className="fb-search">
      <SearchIcon />
      <input
        type="text"
        className="fb-search-input"
        placeholder="Search games..."
        value={state.search}
        onChange={(e) => dispatch({ type: 'SET_SEARCH', payload: e.target.value })}
      />
    </div>
  );
}
