import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OwnButton from '../components/OwnButton';
import { OwnersContext } from '../context/ownersContextValue';
import type { OwnersData } from '../hooks/useOwnersData';

function renderWith(value: Partial<OwnersData>) {
  const ctx: OwnersData = { owners: {}, mine: new Set(), loaded: true, toggle: vi.fn(async () => true), ...value };
  render(
    <OwnersContext.Provider value={ctx}>
      <OwnButton itemId="azul" itemName="Azul" />
    </OwnersContext.Provider>,
  );
  return ctx;
}

describe('OwnButton', () => {
  beforeEach(() => localStorage.clear());

  it('renders without a provider as an enabled, unowned toggle with no owners', () => {
    render(<OwnButton itemId="azul" itemName="Azul" />);
    const btn = screen.getByRole('button', { name: 'Mark that you own Azul' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/Owned by/)).not.toBeInTheDocument();
  });

  it('without a provider the default no-op toggle succeeds and the name is remembered', async () => {
    localStorage.setItem('gameroom:name', 'Jess');
    render(<OwnButton itemId="azul" itemName="Azul" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark that you own Azul' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(localStorage.getItem('gameroom:name')).toBe('Jess');
  });

  it('lists who owns the item', () => {
    renderWith({ owners: { azul: ['Alex', 'Sam'] } });
    expect(screen.getByText('Owned by Alex, Sam')).toBeInTheDocument();
  });

  it('shows the pressed state when the item is mine', () => {
    renderWith({ mine: new Set(['azul']) });
    expect(screen.getByRole('button', { name: /You own Azul/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('is disabled until ownership has loaded', () => {
    renderWith({ loaded: false });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('asks for a name on first use, toggles, and remembers the name once accepted', async () => {
    const ctx = renderWith({});
    fireEvent.click(screen.getByRole('button', { name: 'Mark that you own Azul' }));
    expect(ctx.toggle).not.toHaveBeenCalled();
    const input = screen.getByLabelText('Your name');
    fireEvent.change(input, { target: { value: '  Jess ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(ctx.toggle).toHaveBeenCalledWith('azul', 'Jess');
    await waitFor(() => expect(localStorage.getItem('gameroom:name')).toBe('Jess'));
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('rejects an invalid name with a hint and can cancel the prompt', () => {
    const ctx = renderWith({});
    fireEvent.click(screen.getByRole('button', { name: 'Mark that you own Azul' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(ctx.toggle).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jo & Bo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(ctx.toggle).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Use 1–30 letters');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('re-prompts, prefilled, when the remembered name would be refused', () => {
    localStorage.setItem('gameroom:name', 'O’Brien');
    const ctx = renderWith({});
    fireEvent.click(screen.getByRole('button', { name: 'Mark that you own Azul' }));
    expect(ctx.toggle).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Your name')).toHaveValue('O’Brien');
  });

  it('shows an error and keeps the name unsaved when the server refuses', async () => {
    const ctx = renderWith({ toggle: vi.fn(async () => false) });
    fireEvent.click(screen.getByRole('button', { name: 'Mark that you own Azul' }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Jess' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(ctx.toggle).toHaveBeenCalledWith('azul', 'Jess');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save"));
    expect(localStorage.getItem('gameroom:name')).toBeNull();
  });

  it('toggles straight away once a name is remembered', () => {
    localStorage.setItem('gameroom:name', 'Jess');
    const ctx = renderWith({});
    fireEvent.click(screen.getByRole('button', { name: 'Mark that you own Azul' }));
    expect(ctx.toggle).toHaveBeenCalledWith('azul', 'Jess');
  });

  it('disables itself while its request is in flight, then re-enables', async () => {
    localStorage.setItem('gameroom:name', 'Jess');
    let resolve: (ok: boolean) => void = () => {};
    const ctx = renderWith({ toggle: vi.fn(() => new Promise<boolean>((r) => { resolve = r; })) });
    const btn = screen.getByRole('button', { name: 'Mark that you own Azul' });
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(ctx.toggle).toHaveBeenCalledTimes(1);
    resolve(true);
    await waitFor(() => expect(btn).toBeEnabled());
  });

  it('unmarks without asking for a name', () => {
    const ctx = renderWith({ mine: new Set(['azul']) });
    fireEvent.click(screen.getByRole('button', { name: /You own Azul/ }));
    expect(ctx.toggle).toHaveBeenCalledWith('azul', '');
  });
});
