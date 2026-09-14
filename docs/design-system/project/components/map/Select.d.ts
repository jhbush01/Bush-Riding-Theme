import * as React from 'react';

/** Compact native select (.filter__select) used in the filter drawer. */
export interface SelectProps {
  options?: Array<string | { value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  label?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  style?: React.CSSProperties;
}
export function Select(props: SelectProps): JSX.Element;
