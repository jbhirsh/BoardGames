import type { WishlistItem } from '../data/types';
import { ytURL, amazonURL } from '../utils/urls';
import ExternalLink from './ExternalLink';
import { YouTubeIcon, CartIcon } from './Icons';
import { outlineIconClass, videoButtonClass } from './sharedClasses';

/**
 * The outbound links every wishlist item shows: buy on Amazon (a search) and
 * a YouTube tutorial search.
 */
export default function WishlistLinks({ item }: { item: WishlistItem }) {
  return (
    <>
      <ExternalLink
        className={`${outlineIconClass} can-hover:hover:transform-[scale(1.05)] can-hover:hover:border-amazon-edge/50 can-hover:hover:bg-amazon/10 can-hover:hover:text-text`}
        href={amazonURL(item.name)}
        aria-label={`Buy ${item.name} on Amazon`}
        title="Buy on Amazon"
      >
        <CartIcon />
      </ExternalLink>
      <ExternalLink
        className={videoButtonClass}
        href={ytURL(item.yt)}
        aria-label={`Watch ${item.name} tutorial on YouTube`}
      >
        <YouTubeIcon />
      </ExternalLink>
    </>
  );
}
