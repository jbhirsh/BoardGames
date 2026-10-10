import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Turns html{scroll-behavior:smooth} off while the router moves the page.
 * ScrollRestoration scrolls with a plain scrollTo, which inherits smooth: a
 * new page would glide up to its top, and Back would glide down from there
 * to the list's offset, or land off it when clicked mid-glide. Rendered just
 * before ScrollRestoration, so this layout effect runs ahead of its restore;
 * smooth comes back in a passive effect, once the page is in place.
 */
export default function InstantRouteScroll() {
  const location = useLocation();
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.style.scrollBehavior = 'auto';
    // Read back so the style is recalculated now: Chrome's scrollTo goes by
    // the computed value it already has, which would still say smooth.
    void getComputedStyle(html).scrollBehavior;
  }, [location]);
  useEffect(() => {
    document.documentElement.style.scrollBehavior = '';
  }, [location]);
  return null;
}
