import type { AnchorHTMLAttributes } from 'react';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'target' | 'rel' | 'onClick'> & { href: string };

/**
 * A link to a third-party page (a tutorial video, a rules search, a shop),
 * opened in a new tab without handing that page a window.opener or a
 * referrer. It stays a plain anchor, so middle-click, "open in new tab" and
 * copy-link work as they do anywhere else. The click stops at the link, so
 * the list row or card it sits in doesn't toggle too.
 */
export default function ExternalLink({ href, children, ...rest }: Props) {
  return (
    <a {...rest} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
}
