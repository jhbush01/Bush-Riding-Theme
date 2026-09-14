import * as React from 'react';

/**
 * Bush Map action button (.button). Square 2px corners, Archivo 600.
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** default (outline) · primary (ink fill, full width) · danger. */
  variant?: 'default' | 'primary' | 'danger';
  fullWidth?: boolean;
  href?: string;
  type?: 'button' | 'submit';
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export function Button(props: ButtonProps): JSX.Element;
