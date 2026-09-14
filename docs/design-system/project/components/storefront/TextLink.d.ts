import * as React from 'react';

/** Inline underlined link (.alp-text-link): ink, navy on hover. */
export interface TextLinkProps {
  children?: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export function TextLink(props: TextLinkProps): JSX.Element;
