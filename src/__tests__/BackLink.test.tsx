import { describe, it, expect } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import BackLink from '../components/BackLink';
import { cameFromList, FROM_LIST } from '../utils/fromList';
import { renderRouted } from './routed';

const LIST = '/?p=4&d=30';
const back = () => screen.getByRole('link', { name: /Back to The Game Room/ });

/** BackLink on a rules page, with the filtered list one step behind it. */
function renderBackLink(state?: unknown) {
  return renderRouted(<BackLink />, [LIST, { pathname: '/rules/catan', state }], '/rules/:slug');
}

describe('BackLink', () => {
  it('is a real link to the home page', () => {
    renderBackLink(FROM_LIST);
    expect(back()).toHaveAttribute('href', '/');
    expect(back()).toHaveClass('back-link');
  });

  it('goes back to the list as it was left when the page was reached from it', () => {
    const router = renderBackLink(FROM_LIST);
    act(() => { fireEvent.click(back()); });
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?p=4&d=30');
  });

  it.each([undefined, null, { fromList: 'yes' }])('goes to the home page when the page was reached another way (state %j)', (state) => {
    // A deep link or a fresh launch: the entry behind it is not the list.
    const router = renderBackLink(state);
    act(() => { fireEvent.click(back()); });
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
  });

  it.each([
    ['a middle click', { button: 1 }],
    ['a ctrl-click', { ctrlKey: true }],
    ['a cmd-click', { metaKey: true }],
    ['a shift-click', { shiftKey: true }],
    ['an alt-click', { altKey: true }],
  ])('leaves %s to the browser, to open the home page fresh', (_, init) => {
    const router = renderBackLink(FROM_LIST);
    const click = fireEvent.click(back(), init);
    // Not cancelled, so the browser opens the link; history is untouched.
    expect(click).toBe(true);
    expect(router.state.location.pathname).toBe('/rules/catan');
  });
});

describe('cameFromList', () => {
  it('is true only for the state a list link carries', () => {
    expect(cameFromList(FROM_LIST)).toBe(true);
    expect(cameFromList({ fromList: true, other: 1 })).toBe(true);
    expect(cameFromList({ fromList: 1 })).toBe(false);
    expect(cameFromList({})).toBe(false);
    expect(cameFromList(null)).toBe(false);
    expect(cameFromList(undefined)).toBe(false);
  });
});
