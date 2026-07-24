"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";

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
  const [mounted, setMounted] = useState(false);
  const t = useT();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("common.zoomPreview")}
      className={cn(
        "fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/75 p-4",
        className
      )}
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        decoding="async"
        className="max-h-[90vh] max-w-[min(90vw,720px)] cursor-default object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body
  );
}
