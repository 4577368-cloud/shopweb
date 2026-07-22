import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE, APP_FULL_NAME } from "@/lib/brand";

type LogoSize = "sm" | "md" | "lg";

const markSizeClass: Record<LogoSize, string> = {
  sm: "h-7 w-7 rounded-[9px]",
  md: "h-8 w-8 rounded-[10px]",
  lg: "h-10 w-10 rounded-xl",
};

const markIconSize: Record<LogoSize, number> = {
  sm: 15,
  md: 17,
  lg: 21,
};

/** Stylized mark: T monogram + matched pair nodes */
export function AppLogoMark({
  size = "md",
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  const icon = markIconSize[size];
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center bg-gradient-to-br from-brand via-emerald-500 to-teal-600 shadow-sm ring-1 ring-brand/15",
        markSizeClass[size],
        className
      )}
      aria-hidden
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6.5 7h11"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M12 7v8.5"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="7.5" cy="17.5" r="2.2" fill="white" fillOpacity="0.92" />
        <circle cx="16.5" cy="17.5" r="2.2" fill="white" />
        <path
          d="M9.7 17.5h4.6"
          stroke="white"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />
      </svg>
    </span>
  );
}

function AppLogoWordmark({
  size = "md",
  layout = "stacked",
  className,
}: {
  size?: LogoSize;
  layout?: "stacked" | "inline";
  className?: string;
}) {
  const nameClass =
    size === "sm"
      ? "text-[13px] font-bold"
      : size === "lg"
        ? "text-[17px] font-bold"
        : "text-[14px] font-bold";

  const taglineClass =
    size === "sm"
      ? "text-[9px] tracking-[0.16em]"
      : size === "lg"
        ? "text-[11px] tracking-[0.14em]"
        : "text-[10px] tracking-[0.14em]";

  if (layout === "inline") {
    return (
      <span className={cn("min-w-0 font-display leading-tight", className)}>
        <span className={cn(nameClass, "tracking-[-0.02em] text-ink")}>
          {APP_NAME}
        </span>
        <span className="mx-1.5 text-ink-subtle/80">·</span>
        <span
          className={cn(
            taglineClass,
            "font-semibold uppercase text-brand-strong"
          )}
        >
          {APP_TAGLINE}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("min-w-0 font-display leading-tight", className)}>
      <span className={cn(nameClass, "block tracking-[-0.02em] text-ink")}>
        {APP_NAME}
      </span>
      <span
        className={cn(
          taglineClass,
          "mt-0.5 block font-semibold uppercase text-brand-strong"
        )}
      >
        {APP_TAGLINE}
      </span>
    </span>
  );
}

export interface AppLogoProps {
  size?: LogoSize;
  /** Sidebar: mark + stacked wordmark. Header: mark + inline wordmark. */
  variant?: "sidebar" | "header" | "mark";
  href?: string;
  className?: string;
}

/**
 * Tangbuy Smart Match logo — mark + display typography.
 * Use in sidebar, install header, and any standalone page chrome.
 */
export function AppLogo({
  size = "md",
  variant = "sidebar",
  href,
  className,
}: AppLogoProps) {
  const content =
    variant === "mark" ? (
      <AppLogoMark size={size} />
    ) : (
      <span
        className={cn(
          "inline-flex items-center",
          variant === "sidebar" ? "gap-2.5" : "gap-2",
          className
        )}
      >
        <AppLogoMark size={size} />
        <AppLogoWordmark
          size={size}
          layout={variant === "header" ? "inline" : "stacked"}
        />
      </span>
    );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0" aria-label={APP_FULL_NAME}>
        {content}
      </Link>
    );
  }

  return content;
}
