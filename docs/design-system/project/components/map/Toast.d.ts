import * as React from 'react';

/** Bottom-centre confirmation toast (.brm-toast). */
export interface ToastProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Toast(props: ToastProps): JSX.Element;
