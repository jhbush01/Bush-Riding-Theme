import * as React from 'react';

/** The hand-painted Bush Riding brush wordmark (raster PNG), sized by height. */
export interface WordmarkProps {
  /** Image URL. Defaults to the bundled assets/logo-wordmark.png. */
  src?: string;
  /** Rendered height in px. Default 62 (desktop header). */
  height?: number;
  alt?: string;
  /** Soft drop-shadow for placement over imagery. Default true. */
  shadow?: boolean;
  href?: string;
  style?: React.CSSProperties;
}
export function Wordmark(props: WordmarkProps): JSX.Element;
