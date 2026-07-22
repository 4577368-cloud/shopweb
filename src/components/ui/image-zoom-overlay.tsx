"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function ImageZoomOverlay({
  src,
  alt,
  onClose,
  className,
}: {
  src: string;
  alt: string;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <button
      type="button"
      className={cn(
        "fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/75 p-4",
        className
      )}
      aria-label="关闭放大预览"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        decoding="async"
        className="max-h-[90vh] max-w-[min(90vw,720px)] object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </button>,
    document.body
  );
}
