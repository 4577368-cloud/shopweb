"use client";

import Image, { type ImageProps } from "next/image";

type ThumbImageProps = Omit<ImageProps, "src"> & {
  src: string;
  /** Ignored — kept for call-site compatibility after reverting CDN resize. */
  pixelWidth?: number;
};

/** Product thumbnail — direct CDN URL (unoptimized, reliable across hosts). */
export function ThumbImage({ src, alt, pixelWidth: _pixelWidth, ...props }: ThumbImageProps) {
  return <Image src={src} alt={alt} unoptimized {...props} />;
}
