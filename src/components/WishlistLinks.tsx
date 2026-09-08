import type { WishlistItem } from '../data/types';
import { ytURL, amazonURL, priceTrackerURL } from '../utils/urls';
import { YouTubeIcon, CartIcon, TrendIcon } from './Icons';

/**
 * Opens a third-party page in a new tab without handing it a window.opener.
 * The anchors also carry target/rel so middle-click and "open in new tab",
 * which bypass the click handler, get the same protection.
 */
function openExternal(url: string) {
  window.open(url, '_blank', 'noopener');
}

/**
 * The outbound links every wishlist item shows: price history (only when the
 * item has a verified ASIN), buy on Amazon, and a YouTube tutorial search.
 */
export default function WishlistLinks({ item }: { item: WishlistItem }) {
  const trackHref = item.asin ? priceTrackerURL(item.asin) : null;
  const amazonHref = amazonURL(item.name, item.asin);
  const ytHref = ytURL(item.yt);
  return (
    <>
      {trackHref && (
        <a
          className="wish-track"
          href={trackHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Track ${item.name} price history on CamelCamelCamel`}
          title="Price history & alerts"
          onClick={(e) => { e.preventDefault(); openExternal(trackHref); }}
        >
          <TrendIcon />
        </a>
      )}
      <a
        className="wish-amz"
        href={amazonHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Buy ${item.name} on Amazon`}
        title="Buy on Amazon"
        onClick={(e) => { e.preventDefault(); openExternal(amazonHref); }}
      >
        <CartIcon />
      </a>
      <a
        className="wish-yt"
        href={ytHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Watch ${item.name} tutorial on YouTube`}
        onClick={(e) => { e.preventDefault(); openExternal(ytHref); }}
      >
        <YouTubeIcon />
      </a>
    </>
  );
}
