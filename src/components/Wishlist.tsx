import { WISHLIST } from '../data/wishlist';
import WishlistCard from './WishlistCard';

export default function Wishlist() {
  return (
    <section className="wishlist">
      <div className="sec-hd">
        <h2 className="sec-title">Wishlist</h2>
        <span className="sec-count">{WISHLIST.length} titles</span>
      </div>
      <div className="wish-grid">
        {WISHLIST.map((item) => (
          <WishlistCard key={item.name} item={item} />
        ))}
      </div>
    </section>
  );
}
