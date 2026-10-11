import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import RouteFallback, { RulesFallback } from '../components/RouteFallback';
import { GAMES } from '../data/games';
import { renderRouted } from './routed';

/** The fallback's bars, the header's text laid out unseen: heading first, then the line under it. */
const bars = (container: HTMLElement) => [...container.querySelectorAll('.skeleton-text')].map((bar) => bar.textContent);

describe('RouteFallback', () => {
  it('keeps the Back link working and says the page is loading', () => {
    renderRouted(<RouteFallback title="Word Checker" />, ['/word-checker'], '/word-checker');
    expect(screen.getByRole('link', { name: /Back to The Game Room/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('lays out the page\'s heading as a hidden bar, with room for its box art', () => {
    renderRouted(<RouteFallback title="Score Calculator" />, ['/score/7-wonders'], '/score/:slug');
    const header = screen.getByRole('banner');
    expect(bars(header)).toEqual(['Score Calculator', 'Loading']);
    expect(header.querySelector('.rules-title-row')).toHaveAttribute('aria-hidden', 'true');
    expect(header.querySelector('.rules-box-art')).not.toBeNull();
    // Nothing a screen reader would read as the page's heading.
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('leaves out the box art for a page without it', () => {
    renderRouted(<RouteFallback title="Owner sign-in" art={false} />, ['/sign-in'], '/sign-in');
    expect(screen.getByRole('banner').querySelector('.rules-box-art')).toBeNull();
  });
});

describe('RulesFallback', () => {
  const render = (path: string) => renderRouted(<RulesFallback />, [path], '/rules/:slug/:part?');
  const buttons = () => [...screen.getByRole('banner').querySelectorAll('.rules-chat-toggle')].map((b) => b.textContent);

  it('sizes the header by the game\'s name and its rulebook\'s line, beside the assistant\'s button', () => {
    const catan = GAMES.find((g) => g.slug === 'catan')!;
    render('/rules/catan');
    expect(bars(screen.getByRole('banner'))).toEqual(['Catan', catan.short]);
    expect(buttons()).toEqual(['AI Rules Assistant']);
  });

  it('takes the line of the rulebook the tab shows', () => {
    const extension = GAMES.find((g) => g.slug === 'catan')!.subgames!.find((s) => s.slug === '5-6-player-extension')!;
    render('/rules/catan/5-6-player-extension');
    expect(bars(screen.getByRole('banner'))).toEqual(['Catan', extension.short]);
  });

  it('holds room for the score calculator\'s link and the word checker\'s button where the page has them', () => {
    render('/rules/7-wonders');
    expect(buttons()).toEqual(['AI Rules Assistant', ' Score calculator']);
  });

  it('holds room for the word checker\'s button on Bananagrams', () => {
    render('/rules/bananagrams');
    expect(buttons()).toEqual(['AI Rules Assistant', 'Word Checker']);
  });

  it.each(['/rules/no-such-game', '/rules/catan/no-such-rulebook'])('falls back to the plain header for a game or rulebook that isn\'t there (%s)', (path) => {
    render(path);
    expect(bars(screen.getByRole('banner'))).toEqual(['The Game Room', 'Loading']);
    expect(buttons()).toEqual([]);
  });
});
