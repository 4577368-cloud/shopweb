"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { HUB_ENABLED } from "./flags";

const STORAGE_KEY = "tangbuy:hub-mode";

interface HubModeValue {
  /** Whether the Operations Hub is compiled in (dev only by default). */
  available: boolean;
  /** Current switch state (only meaningful when `available`). */
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

const HubModeContext = createContext<HubModeValue>({
  available: false,
  enabled: false,
  toggle: () => {},
  setEnabled: () => {},
});

/**
 * Dev/testing-only switch for the Operations Hub (订单/运营/履约中心).
 *
 * - Gated by `HUB_ENABLED` (src/lib/hub/flags.ts): in a production build the
 *   hub is not compiled in, so `available` is false and the store-opening
 *   experience is never affected.
 * - Persisted to localStorage so the switch survives reloads / language
 *   switches during local testing.
 */
export function HubModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    if (!HUB_ENABLED) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setEnabledState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const toggle = () => setEnabled(!enabled);

  return (
    <HubModeContext.Provider
      value={{ available: HUB_ENABLED, enabled, toggle, setEnabled }}
    >
      {children}
    </HubModeContext.Provider>
  );
}

export function useHubMode(): HubModeValue {
  return useContext(HubModeContext);
}
