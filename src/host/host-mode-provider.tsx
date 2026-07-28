"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  useEmbeddedMode,
  type EmbeddedModeSnapshot,
} from "@/host/embedded/use-embedded-mode";
import { resolveAuthStrategy, type AuthStrategy } from "@/host/adapters/auth-transport";

export type HostModeContextValue = EmbeddedModeSnapshot & {
  authStrategy: AuthStrategy;
};

const HostModeContext = createContext<HostModeContextValue | null>(null);

/**
 * Provides embedded/standalone detection + auth strategy selection to Host chrome.
 * Does not initialize App Bridge yet (Phase B/C). Safe for standalone SSR.
 */
export function HostModeProvider({ children }: { children: ReactNode }) {
  const mode = useEmbeddedMode();
  const value = useMemo<HostModeContextValue>(
    () => ({
      ...mode,
      authStrategy: resolveAuthStrategy(mode.isEmbedded),
    }),
    [mode]
  );
  return (
    <HostModeContext.Provider value={value}>{children}</HostModeContext.Provider>
  );
}

export function useHostMode(): HostModeContextValue {
  const ctx = useContext(HostModeContext);
  if (!ctx) {
    // Allow use outside provider during incremental migration — treat as standalone.
    return {
      isEmbedded: false,
      host: "",
      shop: "",
      authStrategy: resolveAuthStrategy(false),
    };
  }
  return ctx;
}
