import type { WishlistItem } from '../data/types';
import { ytURL } from '../utils/urls';
import { YouTubeIcon } from './Icons';

interface Props {
  item: WishlistItem;
}

export default function WishlistCard({ item }: Props) {
  return (
    <div className="wish-card">
      <span className="wish-lbl">Wishlist</span>
      <h3 className="wish-name">{item.name}</h3>
      <p className="wish-desc">{item.desc}</p>
      <a
        className="wish-yt"
        href={ytURL(item.yt)}
        onClick={(e) => { e.preventDefault(); window.open(ytURL(item.yt), '_blank'); }}
      >
        <YouTubeIcon />
      </a>
    </div>
  );
}
