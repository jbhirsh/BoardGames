import { Link, useLocation, useNavigate, type Location } from 'react-router';
import { cameFromList } from '../utils/fromList';
import { tapTargetClass } from './sharedClasses';

/**
 * "Back to The Game Room" on every sub-page. Reached from the list (a link
 * there carries FROM_LIST), a plain click goes back in history, so the
 * filters (in the URL) and the scroll position (ScrollRestoration) come
 * back with it; the installed app has no browser Back to do that. Reached
 * any other way (a deep link, a fresh launch, the score page from a rules
 * page) it goes to the home page. It stays a real link to "/" either way,
 * so a middle or modified click opens a fresh home page and copying the
 * link works.
 */
export default function BackLink() {
  const location: Location<unknown> = useLocation();
  const fromList = cameFromList(location.state);
  const navigate = useNavigate();

  return (
    <Link
      to="/"
      className={`back-link mb-6 inline-flex items-center gap-1 text-[13px] font-medium text-blue [transition:opacity_0.15s] hover:opacity-70 ${tapTargetClass}`}
      onClick={(e) => {
        if (!fromList || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(-1);
      }}
    >
      &larr; Back to The Game Room
    </Link>
  );
}
