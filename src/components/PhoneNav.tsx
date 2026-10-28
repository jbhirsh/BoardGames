import type { ComponentType } from 'react';
import { useFilterDispatch, useFilterLayout } from '../context/useFilter';
import { useWishlistItems } from '../context/useWishlistItems';
import { goToSuggest } from '../client/suggest';
import type { CollectionMode } from '../data/types';
import RandomPicker from './RandomPicker';
import { HeartIcon, PlusIcon, ShelfIcon } from './Icons';
import { phoneActionClass, pickButtonClass } from './sharedClasses';

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
 * while a text field has focus (a variant on the page's body), when the on-screen keyboard
 * leaves no room for it. Its buttons stay where they are on a switch, so
 * focus needs no handing over as the toggle's does. Suggest a game waits,
 * disabled, for the wishlist's entries, which bring the form it goes to.
 *
 * Its foot pads 8px, or the home indicator's inset where that is more. On
 * iOS (the one platform with `-webkit-touch-callout`) it pads 8px less,
 * none at all in Safari: there Safari's toolbar band, tinted the bar's
 * colour, runs on below it, and an installed app's home indicator sits in
 * the inset's bottom third, so the full padding left the buttons sitting
 * visibly high.
 */
export default function PhoneNav() {
  const { collection } = useFilterLayout();
  const dispatch = useFilterDispatch();
  const { loaded } = useWishlistItems();
  const tab = ({ mode, label, Icon }: (typeof TABS)[number]) => (
    <button
      key={mode}
      type="button"
      className="flex h-13 cursor-pointer flex-col items-center justify-center gap-0.75 rounded-xl text-[11.5px] font-semibold tracking-[0.2px] whitespace-nowrap text-text2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue aria-pressed:text-blue"
      aria-pressed={collection === mode}
      onClick={() => dispatch({ type: 'SET_COLLECTION', payload: mode })}
    >
      <Icon />
      {label}
    </button>
  );

  return (
    <nav
      className="sticky bottom-0 z-150 grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-bg px-gutter pt-2 pb-[max(8px,env(safe-area-inset-bottom))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-[linear-gradient(to_bottom,transparent,var(--color-bg))] before:content-[''] supports-[-webkit-touch-callout:none]:pb-[max(0px,env(safe-area-inset-bottom)-8px)] [body:has(:is(input:not([type=checkbox],[type=radio]),textarea):focus)_&]:invisible"
      aria-label="Which games to show"
      data-phone-nav
    >
      {tab(TABS[0])}
      <div className="flex justify-center">
        <RandomPicker variant="bar" hidden={collection !== 'own'} />
        <button
          type="button"
          className={`pick-btn phone-action ${pickButtonClass} ${phoneActionClass}`}
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
