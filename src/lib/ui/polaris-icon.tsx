import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";

export type PolarisIconSource = ComponentType<SVGProps<SVGSVGElement>>;

/** Wrap a `@shopify/polaris-icons` SVG so it inherits `currentColor`. */
export function createPolarisIcon(
  Source: PolarisIconSource,
  displayName?: string
): ComponentType<SVGProps<SVGSVGElement>> {
  const Icon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
    <Source
      className={cn("shrink-0", className)}
      fill="currentColor"
      aria-hidden={props["aria-label"] ? undefined : true}
      {...props}
    />
  );
  Icon.displayName = displayName ?? Source.displayName ?? "PolarisIcon";
  return Icon;
}
