import { focusTarget } from './focus';

/**
 * Takes the reader to the wishlist's suggestion form, ready to type the
 * game: the wishlist header's Suggest a game on a wider screen, the phone
 * bar's (PhoneNav) on a phone. The form mounts with the wishlist's entries,
 * so the buttons that call this wait for them.
 */
export function goToSuggest(): void {
  const form = document.getElementById('suggest')!;
  form.scrollIntoView({ block: 'start' });
  focusTarget(form, 'field', { preventScroll: true });
}
