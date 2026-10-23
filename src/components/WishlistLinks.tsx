import type { WishlistItem } from '../data/types';
import { ytURL, amazonURL, priceTrackerURL } from '../utils/urls';
import ExternalLink from './ExternalLink';
import { YouTubeIcon, CartIcon, TrendIcon } from './Icons';

/**
 * The outbound links every wishlist item shows: price history (only when the
 * item has a verified ASIN), buy on Amazon, and a YouTube tutorial search.
 */
export default function WishlistLinks({ item }: { item: WishlistItem }) {
  const trackHref = item.asin ? priceTrackerURL(item.asin) : null;
  return (
    <>
      {trackHref && (
        <ExternalLink
          className="wish-track"
          href={trackHref}
          aria-label={`Track ${item.name} price history on CamelCamelCamel`}
          title="Price history & alerts"
        >
          <TrendIcon />
        </ExternalLink>
      )}
      <ExternalLink
        className="wish-amz"
        href={amazonURL(item.name, item.asin)}
        aria-label={`Buy ${item.name} on Amazon`}
        title="Buy on Amazon"
      >
        <CartIcon />
      </ExternalLink>
      <ExternalLink className="wish-yt" href={ytURL(item.yt)} aria-label={`Watch ${item.name} tutorial on YouTube`}>
        <YouTubeIcon />
      </ExternalLink>
    </>
  );
}
