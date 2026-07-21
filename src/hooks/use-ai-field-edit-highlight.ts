"use client";

import { useEffect, useRef, useState } from "react";
import type { AiFieldEditRecord } from "@/lib/ai-field-edit-feedback";
import {
  AI_BEFORE_AFTER_MS,
  AI_CARD_RING_MS,
  AI_FIELD_HIGHLIGHT_MS,
  AI_PILL_MS,
} from "@/lib/ai-field-edit-feedback";

export type AiFieldEditPhases = {
  valueHighlight: boolean;
  cardRing: boolean;
  beforeAfter: boolean;
  pill: boolean;
};

const IDLE: AiFieldEditPhases = {
  valueHighlight: false,
  cardRing: false,
  beforeAfter: false,
  pill: false,
};

/**
 * Drives transient AI-edit visuals from a single edit record.
 * Re-triggers only when createdAt changes (new edit), not on every render.
 */
export function useAiFieldEditPhases(
  edit: AiFieldEditRecord | null | undefined,
  _onConsumed?: () => void
): AiFieldEditPhases {
  const [phases, setPhases] = useState<AiFieldEditPhases>(IDLE);
  const seenAtRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    if (!edit?.createdAt) {
      setPhases(IDLE);
      seenAtRef.current = null;
      return;
    }
    if (seenAtRef.current === edit.createdAt) return;
    seenAtRef.current = edit.createdAt;

    setPhases({
      valueHighlight: true,
      cardRing: true,
      beforeAfter: true,
      pill: true,
    });

    const schedule = (ms: number, patch: Partial<AiFieldEditPhases>) => {
      const id = setTimeout(() => {
        setPhases((prev) => ({ ...prev, ...patch }));
      }, ms);
      timersRef.current.push(id);
    };

    schedule(AI_FIELD_HIGHLIGHT_MS, { valueHighlight: false });
    schedule(AI_CARD_RING_MS, { cardRing: false });
    schedule(AI_BEFORE_AFTER_MS, { beforeAfter: false });
    schedule(AI_PILL_MS, { pill: false });

    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, [edit?.createdAt]);

  return phases;
}
