import { useFilter } from '../../context/useFilter';
import { SearchIcon } from '../Icons';

export default function SearchInput() {
  const { state, dispatch } = useFilter();

  return (
    <div className="relative min-w-0 flex-1 sm:flex-[1_1_100%] [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:top-1/2 [&>svg]:left-3.5 [&>svg]:-translate-y-1/2 [&>svg]:text-text3">
      <SearchIcon />
      {/* autocorrect off so iOS does not rewrite game names mid-search */}
      <input
        type="text"
        className="h-9 w-full rounded-[999px] border border-border2 bg-surface pr-3.5 pl-9.5 text-[16px] text-text shadow-(--shadow-sm) outline-none [transition:border-color_0.18s,box-shadow_0.18s] placeholder:text-text3 hover:border-border-hover focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-bg2)]"
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
