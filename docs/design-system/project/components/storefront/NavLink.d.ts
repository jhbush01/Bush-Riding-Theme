import * as React from 'react';

/** Bare translucent header link — citrus on home, translucent white elsewhere. */
export interface NavLinkProps {
  children?: React.ReactNode;
  /** "home" = citrus yellow (home template); otherwise translucent white. */
  tone?: 'home' | 'over-media';
  /** Heavier, larger weight for the store name. */
  wordmark?: boolean;
  /** Tabular-numeric clock styling. */
  clock?: boolean;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export function NavLink(props: NavLinkProps): JSX.Element;
