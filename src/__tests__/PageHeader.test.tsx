import { describe, it, expect } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import PageHeader from '../components/PageHeader';
import { renderRouted } from './routed';

const CATAN = { img: '/images/catan.webp', name: 'Catan' };

/** The header's structure as class names, in order: what the loading fallback has to match. */
const shape = (header: HTMLElement) => [...header.querySelectorAll('*')]
  .filter((el) => el.className && typeof el.className === 'string' && !el.classList.contains('skeleton-text') && !el.classList.contains('sr-only'))
  .map((el) => el.className);

describe('PageHeader', () => {
  it('leads with Back, then the game\'s box art, the page\'s heading and the line under it', () => {
    renderRouted(<PageHeader title="Score Calculator" desc="Catan" art={CATAN} />);
    const header = screen.getByRole('banner');
    expect(screen.getByRole('link', { name: /Back to The Game Room/ })).toHaveAttribute('href', '/');
    expect(screen.getByAltText('Catan box art')).toHaveAttribute('src', '/images/catan.webp');
    expect(screen.getByRole('heading', { level: 1, name: 'Score Calculator' })).toHaveClass('rules-game-name');
    expect(header.querySelector('.rules-game-desc')).toHaveTextContent('Catan');
    expect(header.querySelector('.rules-title-row')).not.toHaveAttribute('aria-hidden');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('puts the page\'s buttons in the title row, after the title', () => {
    renderRouted(<PageHeader title="Catan" desc="Rules" art={CATAN}><button type="button">Ask</button></PageHeader>);
    const row = screen.getByRole('banner').querySelector('.rules-title-row')!;
    expect(row.lastElementChild).toBe(screen.getByRole('button', { name: 'Ask' }));
  });

  it('leaves out the box art when the page has none', () => {
    renderRouted(<PageHeader title="Owner sign-in" desc="Owner only" />);
    expect(screen.getByRole('banner').querySelector('.rules-box-art')).toBeNull();
  });

  it('while loading, draws the same header in grey bars, hidden from screen readers', () => {
    renderRouted(<PageHeader title="Score Calculator" desc="Catan" art={CATAN} />);
    const loaded = shape(screen.getByRole('banner'));
    cleanup();

    renderRouted(<PageHeader title="Score Calculator" desc="Catan" art loading />);
    const header = screen.getByRole('banner');
    expect(shape(header)).toEqual(loaded);
    expect([...header.querySelectorAll('.skeleton-text')].map((bar) => bar.textContent)).toEqual(['Score Calculator', 'Catan']);
    expect(header.querySelector('.rules-title-row')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('link', { name: /Back to The Game Room/ })).toBeInTheDocument();
  });

  it('while loading, holds the art\'s place with a grey box even when given the game', () => {
    renderRouted(<PageHeader title="Catan" desc="Rules" art={CATAN} loading />);
    expect(screen.getByRole('banner').querySelector('div.rules-box-art')).not.toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
