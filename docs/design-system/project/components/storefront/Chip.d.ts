import * as React from 'react';

/**
 * The storefront's single button/label primitive (.alp-chip): white surface,
 * 1px hairline, 3px radius, 600 Inter. Hover inverts to ink.
 */
export interface ChipProps {
  children?: React.ReactNode;
  /** default (button/label) · price (lighter weight) · submit (ink fill). */
  variant?: 'default' | 'price' | 'submit';
  /** Renders an <a>. */
  href?: string;
  /** Force the tag; defaults to a/button/span from href/onClick. */
  as?: 'a' | 'button' | 'span';
  type?: 'button' | 'submit';
  /** Append the ✦ glyph used on the Explore menu chips. */
  glyph?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}
export function Chip(props: ChipProps): JSX.Element;
