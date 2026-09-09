import { useFilter } from '../context/useFilter';

/** Empty state shared by the collection views and the wishlist. */
export default function NoResults({ message }: { message: string }) {
  const { dispatch } = useFilter();
  return (
    <div className="no-results">
      <p>{message}</p>
      <button className="no-results-btn" onClick={() => dispatch({ type: 'CLEAR_ALL' })}>Clear filters</button>
    </div>
  );
}
