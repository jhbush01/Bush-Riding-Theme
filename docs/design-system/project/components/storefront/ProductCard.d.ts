import * as React from 'react';

/** Product tile: 3:4 image with name + price chips overlaid bottom-left. */
export interface ProductCardProps {
  name: string;
  price?: string;
  href?: string;
  /** The <img>/<image-slot>. Falls back to an olive gradient. */
  image?: React.ReactNode;
  style?: React.CSSProperties;
}
export function ProductCard(props: ProductCardProps): JSX.Element;
