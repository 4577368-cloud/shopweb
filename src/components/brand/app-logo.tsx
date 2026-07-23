import Link from "next/link";
import { cn } from "@/lib/utils";
import { APP_FULL_NAME, BRAND_LOGO_FULL } from "@/lib/brand";

type LogoSize = "sm" | "md" | "lg";

/** Spec §3.3 — full logo max-height 48px, width auto. */
const fullLogoHeight: Record<LogoSize, string> = {
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
};

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

/** Official horizontal logo — sidebar, header, onboarding. */
export function AppLogoFull({
  size = "md",
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  return (
    <img
      src={BRAND_LOGO_FULL}
      alt={APP_FULL_NAME}
      className={cn(
        "block w-auto max-w-full shrink-0 object-contain object-left",
        fullLogoHeight[size],
        className
      )}
    />
  );
}

/** Compact mark fallback when square icon is needed (until logo-124.svg is added). */
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
        "relative flex shrink-0 items-center justify-center bg-brand-soft shadow-sm ring-1 ring-brand-accent/15",
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
          stroke="var(--brand-ink)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M12 7v8.5"
          stroke="var(--brand-accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="7.5" cy="17.5" r="2.2" fill="var(--brand-accent)" fillOpacity="0.92" />
        <circle cx="16.5" cy="17.5" r="2.2" fill="var(--brand-ink)" />
        <path
          d="M9.7 17.5h4.6"
          stroke="var(--brand-ink)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeOpacity="0.75"
        />
      </svg>
    </span>
  );
}

export interface AppLogoProps {
  size?: LogoSize;
  /** Sidebar/header use the official horizontal SVG. `mark` = square fallback only. */
  variant?: "sidebar" | "header" | "mark";
  href?: string;
  className?: string;
}

/**
 * Brand logo for workbench chrome — top-left sidebar and install header.
 */
export function AppLogo({
  size = "md",
  variant = "sidebar",
  href,
  className,
}: AppLogoProps) {
  const resolvedSize = variant === "sidebar" ? "lg" : size;

  const content =
    variant === "mark" ? (
      <AppLogoMark size={size} className={className} />
    ) : (
      <AppLogoFull size={resolvedSize} className={className} />
    );

  if (href) {
    return (
      <Link
        href={href}
        className="block w-full overflow-visible leading-none"
        aria-label={APP_FULL_NAME}
      >
        {content}
      </Link>
    );
  }

  return content;
}
