"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Persist assistant open/closed per workbench page. Independent from drawers/modals/tabs.
 */
export function useWorkspaceAssistant(
  pageKey: string,
  defaultOpen = true
): {
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleAssistant: () => void;
} {
  const storageKey = `wb-assistant-open:${pageKey}`;
  const [assistantOpen, setAssistantOpenState] = useState(defaultOpen);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "0") setAssistantOpenState(false);
      else if (raw === "1") setAssistantOpenState(true);
    } catch {
      /* ignore quota / private mode */
    }
  }, [storageKey]);

  const setAssistantOpen = useCallback(
    (open: boolean | ((prev: boolean) => boolean)) => {
      setAssistantOpenState((prev) => {
        const next = typeof open === "function" ? open(prev) : open;
        try {
          window.localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey]
  );

  const toggleAssistant = useCallback(() => {
    setAssistantOpen((prev) => !prev);
  }, [setAssistantOpen]);

  return { assistantOpen, setAssistantOpen, toggleAssistant };
}
