// Handing focus from one component to another. The element that takes it
// carries a data-focus-target attribute naming what it is, and the code
// handing focus over looks for that name, never for a class: classes are
// styling's to rename, and a renamed one used to turn a jump into a
// runtime error.
//
// The names in use:
//   title            a section's heading
//   item             where a jump to one game lands: its card's name or
//                    its row's toggle
//   field            the first field of a form
//   own-toggle,      the Own/Want toggle's buttons
//   want-toggle

export type FocusTarget = 'title' | 'item' | 'field' | 'own-toggle' | 'want-toggle';

/** Focuses the element marked `target` inside `container`, if it has one. */
export function focusTarget(container: ParentNode, target: FocusTarget, options?: FocusOptions): void {
  container.querySelector<HTMLElement>(`[data-focus-target="${target}"]`)?.focus(options);
}

/**
 * Once the render under way has painted, focuses the element marked
 * `target` in the section on show: the one carrying the #collection anchor,
 * which only the visible half of the Own/Want toggle does.
 */
export function focusSection(target: FocusTarget = 'title'): void {
  requestAnimationFrame(() => {
    const section = document.getElementById('collection');
    if (section) focusTarget(section, target);
  });
}
