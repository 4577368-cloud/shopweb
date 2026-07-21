"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const AUTO_NEW_ARRIVAL_DEBOUNCE_MS = 20_000;
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export function useAutoNewArrivalAnalysis({
  enabled,
  pendingIds,
  isAnalyzing,
  onAutoRun,
  onRefresh,
  debounceMs = AUTO_NEW_ARRIVAL_DEBOUNCE_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
  enabled: boolean;
  pendingIds: Set<string>;
  isAnalyzing: boolean;
  onAutoRun: (itemIds: string[]) => void | Promise<void>;
  onRefresh: () => void;
  debounceMs?: number;
  pollIntervalMs?: number;
}) {
  const [scheduledCount, setScheduledCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledForKeyRef = useRef("");
  const pendingIdsRef = useRef(pendingIds);
  const onAutoRunRef = useRef(onAutoRun);
  pendingIdsRef.current = pendingIds;
  onAutoRunRef.current = onAutoRun;

  const pendingKey = useMemo(
    () => Array.from(pendingIds).sort().join(","),
    [pendingIds]
  );

  const clearSchedule = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    scheduledForKeyRef.current = "";
    setScheduledCount(0);
  }, []);

  useEffect(() => {
    if (!enabled || isAnalyzing || pendingKey.length === 0) {
      clearSchedule();
      return;
    }

    // Poll refresh rebuilds the Set object — only restart debounce when ids change.
    if (debounceRef.current && scheduledForKeyRef.current === pendingKey) {
      setScheduledCount(pendingIdsRef.current.size);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    scheduledForKeyRef.current = pendingKey;
    setScheduledCount(pendingIdsRef.current.size);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      scheduledForKeyRef.current = "";
      setScheduledCount(0);
      void onAutoRunRef.current(Array.from(pendingIdsRef.current));
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [clearSchedule, debounceMs, enabled, isAnalyzing, pendingKey]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(onRefresh, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, onRefresh, pollIntervalMs]);

  return {
    autoScheduled: scheduledCount > 0,
    autoScheduledCount: scheduledCount,
    cancelAutoSchedule: clearSchedule,
  };
}
