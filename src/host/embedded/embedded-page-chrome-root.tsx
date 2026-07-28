"use client";

import type { ReactNode } from "react";
import { EmbeddedPageChromeProvider } from "@/host/embedded/embedded-page-chrome-context";

/** Client boundary so locale (server) layout can wrap pages with chrome slots. */
export function EmbeddedPageChromeRoot({ children }: { children: ReactNode }) {
  return <EmbeddedPageChromeProvider>{children}</EmbeddedPageChromeProvider>;
}
