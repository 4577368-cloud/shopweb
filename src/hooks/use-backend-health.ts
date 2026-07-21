"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Dev-only connectivity signal for the Copilot status dot. */
export type BackendHealthStatus = "ok" | "down";

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Lightweight probe of `/api/plugin/health`. Intended for a silent status dot — not user-facing copy.
 */
export function useBackendHealth(intervalMs = DEFAULT_INTERVAL_MS): BackendHealthStatus {
  const [status, setStatus] = useState<BackendHealthStatus>("down");

  const probe = useCallback(async () => {
    try {
      const res = await api.getHealth();
      const ok =
        res.status === "UP" &&
        (res.persistenceStatus == null || res.persistenceStatus === "UP");
      setStatus(ok ? "ok" : "down");
    } catch {
      setStatus("down");
    }
  }, []);

  useEffect(() => {
    void probe();
    const id = window.setInterval(() => void probe(), intervalMs);
    return () => window.clearInterval(id);
  }, [probe, intervalMs]);

  return status;
}
