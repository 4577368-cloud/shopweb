"use client";

import { useEffect, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { cdnThumbUrl } from "@/lib/images/cdn-thumb-url";

type ThumbImageProps = {
  src: string;
  alt: string;
  /** Fill parent container (parent must be `position: relative` with explicit size). */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Ignored — next/image compat; sizing comes from layout / className. */
  sizes?: string;
  /** Request width for CDN resize (alicdn / Shopify); omit for full URL. */
  pixelWidth?: number;
} & Pick<
  ImgHTMLAttributes<HTMLImageElement>,
  "loading" | "decoding" | "onClick" | "referrerPolicy"
>;

/** Product thumbnail — direct CDN URL (native img, reliable across hosts). */
export function ThumbImage({
  src,
  alt,
  fill,
  className,
  loading = "lazy",
  pixelWidth,
  sizes: _sizes,
  ...props
}: ThumbImageProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => {
    setThumbFailed(false);
  }, [src, pixelWidth]);

  if (!src) return null;

  const resolvedSrc =
    pixelWidth != null && pixelWidth > 0 && !thumbFailed
      ? cdnThumbUrl(src, pixelWidth)
      : src;

  const handleError: ImgHTMLAttributes<HTMLImageElement>["onError"] = (e) => {
    if (pixelWidth != null && pixelWidth > 0 && !thumbFailed) {
      setThumbFailed(true);
      return;
    }
    props.onError?.(e);
  };

  if (fill) {
    return (
      <img
        src={resolvedSrc}
        alt={alt}
        loading={loading}
        onError={handleError}
        className={cn("absolute inset-0 h-full w-full", className)}
        {...props}
      />
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={handleError}
      className={className}
      {...props}
    />
  );
}
