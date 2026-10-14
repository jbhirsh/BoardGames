/**
 * Scrolls a sideways strip (the rules page's rulebook tabs, the score pad's
 * players) just far enough to show one of its items whole, `margin` pixels
 * clear of either edge, and leaves it be when it already is. Only the strip
 * moves: scrollIntoView would scroll the page too, to bring the strip into
 * view, and leaves a partly visible item where it is.
 */
export function revealInStrip(strip: HTMLElement, el: HTMLElement, margin = 0): void {
  const left = el.offsetLeft - strip.offsetLeft;
  const right = left + el.offsetWidth;
  if (left < strip.scrollLeft + margin) {
    strip.scrollLeft = Math.max(0, left - margin);
  } else if (right > strip.scrollLeft + strip.clientWidth - margin) {
    strip.scrollLeft = right - strip.clientWidth + margin;
  }
}
