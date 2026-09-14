import * as React from 'react';

/** Submission status pill (.subs-item__badge). */
export interface StatusBadgeProps {
  tone?: 'pending' | 'rejected' | 'approved';
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
