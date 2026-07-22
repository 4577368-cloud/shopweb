"use client";

import type { CSSProperties, ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ThumbImageProps = {
  src: string;
  alt: string;
  /** Fill parent container (parent must be `position: relative` with explicit size). */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Ignored — next/image compat; sizing comes from layout / className. */
  sizes?: string;
  /** Ignored — kept for call-site compatibility after reverting CDN resize. */
  pixelWidth?: number;
} & Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  "loading" | "decoding" | "onClick" | "onError" | "referrerPolicy"
>;

/** Product thumbnail — direct CDN URL (native img, reliable across hosts). */
export function ThumbImage({
  src,
  alt,
  fill,
  className,
  loading = "lazy",
  pixelWidth: _pixelWidth,
  sizes: _sizes,
  ...props
}: ThumbImageProps) {
  if (!src) return null;

  if (fill) {
    return (
      <img
        src={src}
        alt={alt}
        loading={loading}
        className={cn("absolute inset-0 h-full w-full", className)}
        {...props}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      {...props}
    />
  );
}
