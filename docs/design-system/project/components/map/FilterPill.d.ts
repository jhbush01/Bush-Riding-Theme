import * as React from 'react';

/** Category show/hide pill (.cat) with a pin-colour dot. Inactive fades back. */
export interface FilterPillProps {
  children?: React.ReactNode;
  /** Pin family — sets the dot colour. */
  tone?: 'routes' | 'bush' | 'famous';
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export function FilterPill(props: FilterPillProps): JSX.Element;
