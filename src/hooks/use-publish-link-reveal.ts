"use client";

import { useCallback, useRef, useState } from "react";
import {
  buildPublishRevealSearchResult,
  publishRevealScores,
  removePublishReveal,
  type PublishRevealEntry,
} from "@/lib/batch-link/publish-reveal";
import type { BatchLinkCardDrive } from "@/lib/batch-link/types";

const SEARCH_MS = 1_100;
const CANDIDATES_READY_MS = 700;
const SELECT_PRESSED_MS = 240;
const BINDING_MS = 650;
const DONE_FLASH_MS = 520;
const SCROLL_SETTLE_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function usePublishLinkReveal({
  shopName,
  onScrollToProduct,
  onRevealComplete,
}: {
  shopName: string;
  onScrollToProduct?: (productId: string) => void;
  onRevealComplete?: (productId: string) => void;
}) {
  const [cardStates, setCardStates] = useState<Record<string, BatchLinkCardDrive>>({});
  const [isRunning, setIsRunning] = useState(false);
  const runIdRef = useRef(0);
  const runningRef = useRef(false);

  const patchCard = useCallback((productId: string, patch: Partial<BatchLinkCardDrive>) => {
    setCardStates((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        state: "idle",
        ...patch,
      },
    }));
  }, []);

  const start = useCallback(
    async (entries: PublishRevealEntry[]) => {
      if (entries.length === 0 || runningRef.current) return;
      runningRef.current = true;
      setIsRunning(true);
      const runId = ++runIdRef.current;

      for (const entry of entries) {
        if (runId !== runIdRef.current) break;
        const id = entry.thirdPlatformItemId;
        const searchResult = buildPublishRevealSearchResult(entry.candidate);
        const { matchScores, imageScores } = publishRevealScores(entry.candidate);

        onScrollToProduct?.(id);
        await sleep(SCROLL_SETTLE_MS);

        patchCard(id, {
          state: "searching",
          highlightTopCandidate: false,
          selectButtonPhase: "idle",
          doneFlash: false,
          searchResult: null,
        });
        await sleep(SEARCH_MS);
        if (runId !== runIdRef.current) break;

        patchCard(id, {
          state: "candidates_ready",
          searchResult,
          matchScores,
          imageScores,
          highlightTopCandidate: true,
        });
        await sleep(CANDIDATES_READY_MS);
        if (runId !== runIdRef.current) break;

        patchCard(id, {
          state: "auto_selecting",
          searchResult,
          matchScores,
          imageScores,
          highlightTopCandidate: true,
          selectButtonPhase: "pressed",
        });
        await sleep(SELECT_PRESSED_MS);
        if (runId !== runIdRef.current) break;

        patchCard(id, {
          state: "binding",
          searchResult,
          matchScores,
          imageScores,
          highlightTopCandidate: true,
          selectButtonPhase: "loading",
        });
        await sleep(BINDING_MS);
        if (runId !== runIdRef.current) break;

        patchCard(id, {
          state: "done",
          searchResult,
          matchScores,
          imageScores,
          highlightTopCandidate: false,
          selectButtonPhase: "idle",
          doneFlash: true,
        });
        removePublishReveal(shopName, id);
        onRevealComplete?.(id);
        await sleep(DONE_FLASH_MS);
        if (runId !== runIdRef.current) break;

        patchCard(id, { state: "idle", doneFlash: false });
      }

      setIsRunning(false);
      runningRef.current = false;
    },
    [onRevealComplete, onScrollToProduct, patchCard, shopName]
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;
    runningRef.current = false;
    setIsRunning(false);
    setCardStates({});
  }, []);

  return {
    cardStates,
    start,
    reset,
    isRunning,
  };
}
