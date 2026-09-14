import * as React from 'react';

/** A row in the route results list (.result). */
export interface ResultItemProps {
  name: string;
  meta?: string;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export function ResultItem(props: ResultItemProps): JSX.Element;
