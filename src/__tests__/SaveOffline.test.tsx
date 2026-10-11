import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SaveOffline from '../components/SaveOffline';
import type { SaveState } from '../pdfjs/saved';

/** The polite live region beside the item, which says how a save ended. */
const said = (container: HTMLElement) => container.querySelector('[aria-live="polite"]')!;

const SEVEN = '/rules/7-wonders.pdf';

/** The item as the links row has it, after the Download link whose size describes it. */
function renderItem(props: { pdf?: string; state: SaveState; hidden?: boolean; sized?: boolean; onSave?: () => void }) {
  const item = (p: typeof props) => (
    <>
      <span id="rules-download-size">4.6 MB</span>
      <SaveOffline pdf={p.pdf ?? SEVEN} state={p.state} hidden={p.hidden} sized={p.sized ?? true} onSave={p.onSave ?? (() => {})} />
    </>
  );
  const view = render(item(props));
  return { ...view, update: (next: typeof props) => view.rerender(item(next)) };
}

describe('SaveOffline', () => {
  it('offers to save the rulebook, described by the Download link\'s size', () => {
    const onSave = vi.fn();
    const { container } = renderItem({ state: 'unsaved', onSave });
    const button = screen.getByRole('button', { name: 'Save for offline' });
    expect(button).toHaveAccessibleDescription('4.6 MB');
    // No size of its own: the Download link beside it says it.
    expect(button).toHaveTextContent(/^Save for offline$/);
    expect(button).toHaveClass('rules-download', 'rules-save');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(said(container)).toBeEmptyDOMElement();
  });

  it('points at no size when the Download link has none', () => {
    renderItem({ state: 'unsaved', sized: false });
    expect(screen.getByRole('button', { name: 'Save for offline' })).not.toHaveAttribute('aria-describedby');
  });

  it('says it is saving, as a status rather than a button', () => {
    const { container } = renderItem({ state: 'saving' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Saving…')).toHaveClass('rules-save-status', 'rules-save-saving');
    expect(said(container)).toBeEmptyDOMElement();
  });

  it('says once saved that it is on this device, as plain text', () => {
    const { container } = renderItem({ state: 'saved' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Saved on this device')).toHaveClass('rules-save-status', 'rules-save-saved');
    // Already saved when it came: nothing to announce.
    expect(said(container)).toBeEmptyDOMElement();
  });

  it('says a save that failed did, and tries again on a tap', () => {
    const onSave = vi.fn();
    renderItem({ state: 'failed', onSave });
    const button = screen.getByRole('button', { name: 'Couldn’t save. Try again' });
    expect(button).not.toHaveAttribute('aria-describedby');
    fireEvent.click(button);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('says when the device has no room, with nothing to try again', () => {
    renderItem({ state: 'full' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Not enough space on this device')).toHaveClass('rules-save-full');
  });

  it('holds its place unseen while hidden', () => {
    renderItem({ state: 'unsaved', hidden: true });
    expect(screen.queryByRole('button', { name: 'Save for offline' })).not.toBeInTheDocument();
    expect(screen.getByText('Save for offline')).not.toBeVisible();
  });

  it.each([
    ['saved', 'Saved on this device.'],
    ['failed', 'The rulebook couldn’t be saved.'],
    ['full', 'Not enough space on this device to save the rulebook.'],
  ] as const)('announces a save that ends %s, as it ends', (state, words) => {
    const { container, update } = renderItem({ state: 'saving' });
    update({ state });
    expect(said(container)).toHaveTextContent(words);
  });

  it('announces nothing as a Saving… held unseen gives way to Saved, a rulebook saved already', () => {
    const { container, update } = renderItem({ state: 'saving', hidden: true });
    update({ state: 'saved' });
    expect(said(container)).toBeEmptyDOMElement();
  });

  it('announces a save that ends once its Saving… was shown', () => {
    const { container, update } = renderItem({ state: 'saving', hidden: true });
    update({ state: 'saving' });
    update({ state: 'saved' });
    expect(said(container)).toHaveTextContent('Saved on this device.');
  });

  it('announces nothing for a tab whose rulebook is saved already, nor for a save that ends on another tab', () => {
    const { container, update } = renderItem({ state: 'saving' });
    update({ state: 'saved', pdf: '/rules/azul.pdf' });
    expect(said(container)).toBeEmptyDOMElement();
    update({ state: 'unsaved', pdf: SEVEN });
    expect(said(container)).toBeEmptyDOMElement();
  });

  it('announces nothing when a worker restarted mid-save says it is unsaved, and the last news goes', () => {
    const { container, update } = renderItem({ state: 'saving' });
    update({ state: 'saved' });
    expect(said(container)).toHaveTextContent('Saved on this device.');
    update({ state: 'saving' });
    update({ state: 'unsaved' });
    expect(said(container)).toBeEmptyDOMElement();
  });

  it('keeps focus on the item as the button gives way to a status, and back, scrolling nothing', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { update } = renderItem({ state: 'unsaved' });
    screen.getByRole('button', { name: 'Save for offline' }).focus();
    focus.mockClear();
    update({ state: 'saving' });
    expect(screen.getByText('Saving…')).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
    update({ state: 'failed' });
    expect(screen.getByRole('button', { name: 'Couldn’t save. Try again' })).toHaveFocus();
  });

  it('takes no focus when it never had any', () => {
    const { update } = renderItem({ state: 'unsaved' });
    update({ state: 'saving' });
    expect(document.body).toHaveFocus();
  });

  it('announces nothing when the worker says a rulebook offered for saving is saved already', () => {
    const { container, update } = renderItem({ state: 'unsaved' });
    update({ state: 'saved' });
    expect(said(container)).toBeEmptyDOMElement();
  });

  it('takes no focus it didn\'t have', () => {
    const { update } = renderItem({ state: 'unsaved' });
    const button = screen.getByRole('button', { name: 'Save for offline' });
    button.focus();
    act(() => button.blur());
    update({ state: 'saving' });
    expect(document.body).toHaveFocus();
  });
});
