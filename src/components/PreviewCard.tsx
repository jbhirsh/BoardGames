import { KW } from '../data/keywords';
import type { PreviewDetails } from '../utils/lookupNotice';

const playersText = (min: number, max: number) => (min === max ? `${min}` : max >= 99 ? `${min}+` : `${min}–${max}`);

/**
 * What BoardGameGeek has for a game, shown before anything is stored: on
 * the owner's add form and queue (AdminPanel) and on the page an emailed
 * approve link opens (EmailedDecisionPage).
 */
export default function PreviewCard({ details }: { details: PreviewDetails }) {
  const facts = [`${playersText(details.min, details.max)} ${details.max === 1 ? 'player' : 'players'}`];
  if (details.mins > 0) facts.push(`${details.mins} min`);
  return (
    <div className="admin-preview">
      {details.img && <img className="admin-preview-art" src={details.img} alt="" width={64} height={64} />}
      <div className="admin-preview-main">
        <p className="admin-preview-name">
          {details.name}
          {details.year !== undefined && <span className="admin-muted"> ({details.year})</span>}
        </p>
        <p className="admin-muted">{facts.join(' · ')}</p>
        {details.desc && <p className="admin-preview-desc">{details.desc}</p>}
        {details.kw.length > 0 && (
          <ul className="admin-preview-kw" aria-label="Keywords">
            {details.kw.map((k) => (
              <li key={k}>{KW[k as keyof typeof KW] ?? k}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
