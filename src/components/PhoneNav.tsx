import type { ComponentType } from 'react';
import { useFilterDispatch, useFilterLayout } from '../context/useFilter';
import { useWishlistItems } from '../context/useWishlistItems';
import { goToSuggest } from '../client/suggest';
import type { CollectionMode } from '../data/types';
import RandomPicker from './RandomPicker';
import { HeartIcon, PlusIcon, ShelfIcon } from './Icons';

const TABS: { mode: CollectionMode; label: string; Icon: ComponentType }[] = [
  { mode: 'own', label: 'We own', Icon: ShelfIcon },
  { mode: 'want', label: 'We want', Icon: HeartIcon },
];

/**
 * The phone's bar along the bottom of the screen, where a thumb rests:
 * We own and We want either side (the Own/Want toggle, which the section
 * headings carry on a wider screen), and between them the list's own
 * action, Pick for us under the collection and Suggest a game under the
 * wishlist. It stays on screen down the list (sticky, last in the page, so
 * the page's end scrolls clear of it rather than under it) and steps aside
 * while a text field has focus (App.css), when the on-screen keyboard
 * leaves no room for it. Its buttons stay where they are on a switch, so
 * focus needs no handing over as the toggle's does. Suggest a game waits,
 * disabled, for the wishlist's entries, which bring the form it goes to.
 */
export default function PhoneNav() {
  const { collection } = useFilterLayout();
  const dispatch = useFilterDispatch();
  const { loaded } = useWishlistItems();
  const tab = ({ mode, label, Icon }: (typeof TABS)[number]) => (
    <button
      key={mode}
      type="button"
      className="phone-tab"
      aria-pressed={collection === mode}
      onClick={() => dispatch({ type: 'SET_COLLECTION', payload: mode })}
    >
      <Icon />
      {label}
    </button>
  );

  return (
    <nav className="phone-nav" aria-label="Which games to show">
      {tab(TABS[0])}
      <div className="phone-nav-mid">
        <RandomPicker variant="bar" hidden={collection !== 'own'} />
        <button
          type="button"
          className="pick-btn phone-action"
          hidden={collection !== 'want'}
          disabled={!loaded}
          onClick={goToSuggest}
        >
          <PlusIcon />
          Suggest a game
        </button>
      </div>
      {tab(TABS[1])}
    </nav>
  );
}
