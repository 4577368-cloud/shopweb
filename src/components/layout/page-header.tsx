"use client";

import Link from "next/link";
import { ChevronRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-3",
        className
      )}
    >
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="mb-1.5 flex items-center gap-1 text-[11px] text-slate-400">
            {breadcrumbs.map((item, index) => (
              <span key={item.label} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                {item.href ? (
                  <Link href={item.href} className="hover:text-slate-600">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-slate-500">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
