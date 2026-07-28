"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { navigateInApp, replaceInApp, hrefInApp } from "@/host/adapters/navigation";

/** Hook: App Router–aware in-app navigation that preserves embedded query. */
export function useNavigateInApp() {
  const router = useRouter();
  const push = useCallback(
    (href: string) => navigateInApp(href, router),
    [router]
  );
  const replace = useCallback(
    (href: string) => replaceInApp(href, router),
    [router]
  );
  return { push, replace, hrefInApp };
}
