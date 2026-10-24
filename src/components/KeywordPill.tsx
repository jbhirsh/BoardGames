import { KW } from '../data/keywords';
import type { KeywordId } from '../data/types';
import { pillTapClass } from './sharedClasses';

interface Props {
  keyword: KeywordId;
  active?: boolean;
  onClick?: () => void;
  /** A list row's smaller pill, with room around it in the tags column. */
  small?: boolean;
}

const pillBaseClass = `kw-pill inline-block w-max max-w-25 shrink-0 grow-0 cursor-pointer rounded-[20px] border px-2 py-0.5 text-center leading-[1.3] select-none [transition:background_0.13s,color_0.13s,border-color_0.13s,transform_0.12s] can-hover:hover:transform-[scale(1.05)] ${pillTapClass}`;

export default function KeywordPill({ keyword, active, onClick, small = false }: Props) {
  const interactive = typeof onClick === 'function';
  return (
    <span
      className={`${pillBaseClass} ${small ? 'my-0.5 mr-0.5 text-[11px]' : 'text-[11.5px]'} ${active ? 'lit border-blue-tint/35 bg-blue-bg font-medium text-blue' : 'border-border bg-bg2 text-text2 can-hover:hover:border-blue-tint/25 can-hover:hover:bg-blue-bg can-hover:hover:text-blue'}`}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onClick!();
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? Boolean(active) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClick!();
              }
            }
          : undefined
      }
    >
      {KW[keyword]}
    </span>
  );
}
