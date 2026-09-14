import * as React from 'react';

/** Frosted floating map nav (.map-nav) — Routes / Events. */
export interface MapPillProps {
  items?: Array<{ value: string; label: string; href?: string }>;
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
export function MapPill(props: MapPillProps): JSX.Element;
