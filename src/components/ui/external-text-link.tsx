"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ExternalTextLink({
  href,
  children,
  className,
  title,
}: {
  href?: string | null;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  if (!href?.trim()) {
    return <span className={className}>{children}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn(
        "cursor-pointer transition-colors hover:text-brand hover:underline underline-offset-2",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </a>
  );
}
