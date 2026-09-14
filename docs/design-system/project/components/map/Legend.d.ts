import * as React from 'react';

/** Pin legend: the three pin colours and what they mean. */
export interface LegendProps {
  items?: Array<{ tone: 'routes' | 'famous' | 'bush'; label: string }>;
  style?: React.CSSProperties;
}
export function Legend(props: LegendProps): JSX.Element;
