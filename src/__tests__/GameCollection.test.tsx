import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import GameCollection from '../components/GameCollection';
import FilterBar from '../components/FilterBar/FilterBar';
import { FilterProvider } from '../context/FilterContext';

function renderWithFilter() {
  return render(
    <MemoryRouter>
      <FilterProvider>
        <div className="sticky-header" />
        <FilterBar />
        <GameCollection />
      </FilterProvider>
    </MemoryRouter>
  );
}

function selectFirstKeyword() {
  fireEvent.click(screen.getByRole('button', { name: /Keywords/ }));
  const panel = document.querySelector('[data-dd="keywords"]')!;
  const option = panel.querySelector('.dd-opt')!;
  fireEvent.click(option);
}

function stubHeaderHeight(px: number) {
  const header = document.querySelector('.sticky-header') as HTMLElement;
  Object.defineProperty(header, 'offsetHeight', { value: px, configurable: true });
}

function stubSectionTop(px: number) {
  const section = document.querySelector('section')!;
  section.getBoundingClientRect = () =>
    ({ top: px, bottom: 0, left: 0, right: 0, height: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe('GameCollection scroll behavior', () => {
  const scrollToSpy = vi.fn();

  beforeEach(() => {
    scrollToSpy.mockReset();
    window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 500, writable: true, configurable: true });
  });

  it('does not scroll on initial render', () => {
    renderWithFilter();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('scrolls up when a filter changes and the collection header is hidden above the viewport', () => {
    renderWithFilter();
    stubHeaderHeight(80);
    stubSectionTop(-200);

    selectFirstKeyword();

    expect(scrollToSpy).toHaveBeenCalled();
    const call = scrollToSpy.mock.calls[0][0] as { top: number; behavior: string };
    expect(call.top).toBe(500 + -200 - 80);
    expect(call.behavior).toBe('instant');
  });

  it('does not scroll when the collection header is already in view', () => {
    renderWithFilter();
    stubHeaderHeight(80);
    stubSectionTop(200);

    selectFirstKeyword();

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('does not scroll when only the view mode changes', () => {
    renderWithFilter();
    stubSectionTop(-200);

    fireEvent.click(screen.getByRole('button', { name: /Grid view/i }));

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('clamps scroll target to 0 when computed position is negative', () => {
    Object.defineProperty(window, 'scrollY', { value: 10, writable: true, configurable: true });
    renderWithFilter();
    stubHeaderHeight(80);
    stubSectionTop(-5);

    selectFirstKeyword();

    expect(scrollToSpy).toHaveBeenCalled();
    const call = scrollToSpy.mock.calls[0][0] as { top: number };
    expect(call.top).toBe(0);
  });
});
