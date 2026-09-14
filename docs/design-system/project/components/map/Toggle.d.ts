import * as React from 'react';

/** Segmented single-select (.toggle-group). Re-clicking the active item clears it. */
export interface ToggleProps {
  items?: Array<{ value: string; label: string }>;
  value?: string | null;
  onChange?: (value: string | null) => void;
  style?: React.CSSProperties;
}
export function Toggle(props: ToggleProps): JSX.Element;
