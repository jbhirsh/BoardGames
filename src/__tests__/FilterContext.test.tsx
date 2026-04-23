import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router';
import { FilterProvider } from '../context/FilterContext';
import { useFilter } from '../context/useFilter';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="url">{loc.pathname + loc.search}</div>;
}

function FilterControls() {
  const { state, dispatch } = useFilter();
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => dispatch({ type: 'SET_DURATION', payload: 'quick' })}>
        quick
      </button>
      <button onClick={() => dispatch({ type: 'SET_PLAYERS', payload: 4 })}>
        four
      </button>
      <button onClick={() => dispatch({ type: 'TOGGLE_KEYWORD', payload: 'strategy' })}>
        strategy
      </button>
      <button onClick={() => dispatch({ type: 'CLEAR_ALL' })}>clear</button>
      <button onClick={() => navigate('/?d=long&p=6')}>push-different-url</button>
      <div data-testid="state-duration">{state.duration}</div>
      <div data-testid="state-players">{String(state.players)}</div>
    </>
  );
}

function renderProvider(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <FilterProvider>
        <FilterControls />
        <LocationProbe />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </FilterProvider>
    </MemoryRouter>,
  );
}

describe('FilterProvider URL sync', () => {
  it('hydrates state from the initial URL', () => {
    renderProvider('/?d=quick&p=4');
    // URL preserved on mount because state already matches it.
    expect(screen.getByTestId('url').textContent).toBe('/?d=quick&p=4');
  });

  it('writes filter changes to location.search', () => {
    renderProvider('/');
    expect(screen.getByTestId('url').textContent).toBe('/');

    act(() => fireEvent.click(screen.getByText('quick')));
    expect(screen.getByTestId('url').textContent).toBe('/?d=quick');

    act(() => fireEvent.click(screen.getByText('four')));
    expect(screen.getByTestId('url').textContent).toBe('/?d=quick&p=4');
  });

  it('clears the query when all filters are removed', () => {
    renderProvider('/?d=quick&p=4');
    expect(screen.getByTestId('url').textContent).toBe('/?d=quick&p=4');

    act(() => fireEvent.click(screen.getByText('clear')));
    expect(screen.getByTestId('url').textContent).toBe('/');
  });

  it('hydrates state when the URL changes externally (browser back / pushed URL)', () => {
    renderProvider('/?d=quick&p=4');
    expect(screen.getByTestId('state-duration').textContent).toBe('quick');
    expect(screen.getByTestId('state-players').textContent).toBe('4');

    act(() => fireEvent.click(screen.getByText('push-different-url')));

    // State should now reflect the new URL, not get reverted back to the old filters.
    expect(screen.getByTestId('url').textContent).toBe('/?d=long&p=6');
    expect(screen.getByTestId('state-duration').textContent).toBe('long');
    expect(screen.getByTestId('state-players').textContent).toBe('6');
  });

  it('keeps sync consistent when state and URL both change in one pass', () => {
    // Simulates a caller that dispatches a filter change AND navigates in
    // the same commit — exercises the effect-ordering invariant between
    // the ref updates and the two sync effects.
    function DualAction() {
      const { dispatch } = useFilter();
      const navigate = useNavigate();
      return (
        <button
          onClick={() => {
            dispatch({ type: 'SET_DURATION', payload: 'medium' });
            navigate('/?p=3');
          }}
        >
          dual
        </button>
      );
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <FilterProvider>
          <DualAction />
          <FilterControls />
          <LocationProbe />
          <Routes>
            <Route path="*" element={null} />
          </Routes>
        </FilterProvider>
      </MemoryRouter>,
    );

    act(() => fireEvent.click(screen.getByText('dual')));

    // The wroteUrlRef guard makes the local dispatch win: state→URL writes
    // the filter-state URL first, and URL→state skips the pending HYDRATE.
    // NOTE: this is a lossy operation — the navigate target's p=3 is dropped
    // entirely, not merged. Callers mixing dispatch+navigate in one handler
    // lose the navigate's query params.
    expect(screen.getByTestId('url').textContent).toBe('/?d=medium');
    expect(screen.getByTestId('state-duration').textContent).toBe('medium');
    expect(screen.getByTestId('state-players').textContent).toBe('0');
  });

  it('does not sync URL when on a non-home route', () => {
    render(
      <MemoryRouter initialEntries={['/rules/catan']}>
        <FilterProvider>
          <FilterControls />
          <LocationProbe />
          <Routes>
            <Route path="/rules/:slug" element={<div>rules</div>} />
          </Routes>
        </FilterProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('url').textContent).toBe('/rules/catan');

    act(() => fireEvent.click(screen.getByText('quick')));

    // URL unchanged — filter state updates but we only sync on '/'
    expect(screen.getByTestId('url').textContent).toBe('/rules/catan');
  });
});
