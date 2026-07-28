"use client";

import Link from "next/link";
import {
  useCallback,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { hrefInApp, navigateInApp } from "@/host/adapters/navigation";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";

type LinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  children: ReactNode;
};

/**
 * In-app link that preserves embedded query (`host`/`embedded`/`shop`) and uses
 * soft navigation inside Admin iframe.
 */
export function LinkInApp({ href, onClick, children, ...props }: LinkProps) {
  const router = useRouter();
  const { isEmbedded } = useEmbeddedMode();
  const resolved = hrefInApp(href);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (!isEmbedded) return;
      // Let modified clicks (new tab) use native behaviour.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || props.target === "_blank") {
        return;
      }
      e.preventDefault();
      navigateInApp(href, router);
    },
    [href, isEmbedded, onClick, props.target, router]
  );

  return (
    <Link href={resolved} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
