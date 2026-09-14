import * as React from 'react';

/** Labelled text field (.field + .field-input). Focus turns the border olive. */
export interface FieldProps {
  label?: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  error?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  style?: React.CSSProperties;
}
export function Field(props: FieldProps): JSX.Element;
