import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { applyTheme, THEME_KEY } from '../hooks/useTheme';
import ThemeToggle from '../components/ThemeToggle';

function addThemeColors() {
  for (const scheme of ['light', 'dark']) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.media = `(prefers-color-scheme: ${scheme})`;
    meta.content = scheme === 'dark' ? '#111113' : '#FBFBFD';
    document.head.append(meta);
  }
}
const metas = () => Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map((m) => m.content);

describe('applyTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    addThemeColors();
  });
  afterEach(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    vi.restoreAllMocks();
  });

  it('puts a picked theme on <html>, in storage and on the browser bars', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(metas()).toEqual(['#111113', '#111113']);

    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(metas()).toEqual(['#FBFBFD', '#FBFBFD']);
  });

  it('hands everything back to the system for "system"', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    // Each tag back to its own scheme's colour.
    expect(metas()).toEqual(['#FBFBFD', '#111113']);
  });

  it('still applies the theme when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('offers system, light and dark as one choice, starting from what is in force', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);
    const group = screen.getByRole('radiogroup', { name: 'Colour theme' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Match system', 'Light', 'Dark']);
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveClass('active');

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toHaveClass('active');

    fireEvent.click(screen.getByRole('radio', { name: 'Match system' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('is one Tab stop, and the arrow keys, Home and End move and pick', () => {
    render(<ThemeToggle />);
    const radio = (name: string) => screen.getByRole('radio', { name });
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1]);

    fireEvent.keyDown(radio('Match system'), { key: 'ArrowRight' });
    expect(radio('Light')).toHaveFocus();
    expect(radio('Light')).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([-1, 0, -1]);

    fireEvent.keyDown(radio('Light'), { key: 'ArrowDown' });
    expect(radio('Dark')).toHaveFocus();
    fireEvent.keyDown(radio('Dark'), { key: 'ArrowRight' });
    expect(radio('Match system')).toHaveFocus();
    fireEvent.keyDown(radio('Match system'), { key: 'ArrowLeft' });
    expect(radio('Dark')).toHaveFocus();
    fireEvent.keyDown(radio('Dark'), { key: 'ArrowUp' });
    expect(radio('Light')).toHaveFocus();
    fireEvent.keyDown(radio('Light'), { key: 'End' });
    expect(radio('Dark')).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(radio('Dark'), { key: 'Home' });
    expect(radio('Match system')).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBeUndefined();

    // Other keys are left to the browser.
    fireEvent.keyDown(radio('Match system'), { key: 'a' });
    expect(radio('Match system')).toHaveAttribute('aria-checked', 'true');
  });

  it('starts on Match system with nothing picked', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'Match system' })).toHaveAttribute('aria-checked', 'true');
  });
});
