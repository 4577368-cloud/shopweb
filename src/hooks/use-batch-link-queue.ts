"use client";

import { useCallback, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import { classifyMatchConfidence } from "@/lib/batch-link/confidence";
import { ackAutoLinkedBinding } from "@/lib/batch-link/auto-ack-binding";
import { resolveCandidateConfidence } from "@/lib/batch-link/candidate-confidence";
import { confirmCandidateBinding } from "@/lib/batch-link/confirm-binding";
import {
  isOfferNotFoundError,
  mapImageMatchConfirmError,
} from "@/lib/batch-link/match-errors";
import { runImageSearchPipeline } from "@/lib/batch-link/image-search-pipeline";
import {
  INITIAL_BATCH_LINK_PROGRESS,
  type BatchLinkCardDrive,
  type BatchLinkCardState,
  type BatchLinkProgress,
} from "@/lib/batch-link/types";
import type { ImageBindingView, ImageSearchProduct, ShopMirrorProduct } from "@/lib/types";
import type { BatchLinkSource } from "@/lib/batch-link/types";

const CANDIDATES_READY_MS = 650;
const SELECT_PRESSED_MS = 220;
const DONE_FLASH_MS = 480;
const SCROLL_SETTLE_MS = 200;
const AUTO_BIND_CANDIDATE_LIMIT = 3;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function pushRecent(recent: string[], line: string, max = 5): string[] {
  return [line, ...recent].slice(0, max);
}

function confidenceDrivePatch(
  pipeline: {
    rankedItems: ImageSearchProduct[];
    topScore: number | null;
    matchScores: Record<string, number>;
    imageScores: Record<string, number | null>;
  }
): Pick<
  BatchLinkCardDrive,
  "confidenceTier" | "titleScore" | "imageScore" | "effectiveScore"
> {
  const top = pipeline.rankedItems[0];
  const conf = top
    ? resolveCandidateConfidence(
        top,
        pipeline.matchScores,
        pipeline.imageScores
      )
    : null;
  return {
    confidenceTier: conf?.tier ?? classifyMatchConfidence(pipeline.topScore),
    titleScore: conf?.titleScore ?? null,
    imageScore: conf?.imageScore ?? null,
    effectiveScore: conf?.effectiveScore ?? pipeline.topScore,
  };
}

export function useBatchLinkQueue({
  shopName,
  locale,
  onBound,
  onScrollToProduct,
}: {
  shopName: string;
  locale: Locale;
  onBound: (itemId: string, view: ImageBindingView) => void;
  onScrollToProduct?: (productId: string) => void;
}) {
  const [progress, setProgress] = useState<BatchLinkProgress>(
    INITIAL_BATCH_LINK_PROGRESS
  );
  const runningRef = useRef(false);
  const runIdRef = useRef(0);

  const patchCard = useCallback(
    (productId: string, patch: Partial<BatchLinkCardDrive>) => {
      setProgress((prev) => ({
        ...prev,
        cardStates: {
          ...prev.cardStates,
          [productId]: {
            ...prev.cardStates[productId],
            state: "idle",
            ...patch,
          },
        },
      }));
    },
    []
  );

  const setCardState = useCallback(
    (productId: string, state: BatchLinkCardState, extra?: Partial<BatchLinkCardDrive>) => {
      patchCard(productId, { state, ...extra });
    },
    [patchCard]
  );

  const start = useCallback(
    async (
      products: ShopMirrorProduct[],
      opts?: { source?: BatchLinkSource; deferredIds?: string[] }
    ) => {
      if (runningRef.current) return;
      const source = opts?.source ?? "manual";
      const deferredIds = opts?.deferredIds ?? [];
      const eligible = products.filter((p) => Boolean(p.primaryImageUrl));
      const noImage = products.filter((p) => !p.primaryImageUrl);

      if (eligible.length === 0 && noImage.length === 0) return;

      runningRef.current = true;
      const runId = ++runIdRef.current;

      const initialStates: Record<string, BatchLinkCardDrive> = {};
      for (const p of products) {
        const title = p.title ?? p.thirdPlatformItemId;
        if (!p.primaryImageUrl) {
          initialStates[p.thirdPlatformItemId] = {
            state: "failed",
            productTitle: title,
            errorMessage: "无主图，无法图搜",
          };
        } else {
          initialStates[p.thirdPlatformItemId] = { state: "queued", productTitle: title };
        }
      }

      const sessionOrder = products.map((p) => p.thirdPlatformItemId);

      setProgress({
        active: true,
        done: false,
        source,
        deferredIds,
        total: products.length,
        processed: 0,
        linked: 0,
        needsReview: 0,
        failed: noImage.length,
        currentProductId: null,
        currentProductTitle: null,
        sessionOrder,
        completionOrder: [],
        cardStates: initialStates,
        recent: noImage.length
          ? pushRecent([], `${noImage.length} 个商品无主图，已跳过`)
          : [],
      });

      let linked = 0;
      let needsReview = 0;
      let failed = noImage.length;
      let processed = noImage.length;
      let recent: string[] =
        noImage.length > 0
          ? pushRecent([], `${noImage.length} 个商品无主图，已跳过`)
          : [];

      const bumpProcessed = (
        product: ShopMirrorProduct,
        outcome: "linked" | "needs_review" | "failed",
        line: string
      ) => {
        processed += 1;
        if (outcome === "linked") linked += 1;
        else if (outcome === "needs_review") needsReview += 1;
        else failed += 1;
        recent = pushRecent(recent, line);
        const finishedId = product.thirdPlatformItemId;
        setProgress((prev) => ({
          ...prev,
          processed,
          linked,
          needsReview,
          failed,
          recent,
          currentProductId: null,
          currentProductTitle: null,
          completionOrder: prev.completionOrder.includes(finishedId)
            ? prev.completionOrder
            : [...prev.completionOrder, finishedId],
        }));
      };

      for (const product of eligible) {
        if (runId !== runIdRef.current) break;
        const id = product.thirdPlatformItemId;
        const title = product.title ?? id;

        setProgress((prev) => ({
          ...prev,
          currentProductId: id,
          currentProductTitle: title,
        }));
        onScrollToProduct?.(id);
        await sleep(SCROLL_SETTLE_MS);

        setCardState(id, "searching", {
          productTitle: title,
          highlightTopCandidate: false,
          selectButtonPhase: "idle",
          doneFlash: false,
        });

        const pipeline = await runImageSearchPipeline(shopName, product, undefined, {
          locale,
        });
        if (runId !== runIdRef.current) break;

        const confidencePatch = pipeline.rankedItems.length
          ? confidenceDrivePatch(pipeline)
          : {};

        if (pipeline.error || !pipeline.result || pipeline.rankedItems.length === 0) {
          setCardState(id, "failed", {
            productTitle: title,
            errorMessage: pipeline.error ?? "未找到可靠候选",
            searchResult: null,
            matchScores: {},
            imageScores: {},
          });
          bumpProcessed(product, "failed", `${title}：未找到可靠候选`);
          continue;
        }

        const tier = classifyMatchConfidence(pipeline.topScore);
        if (tier === "none") {
          setCardState(id, "failed", {
            productTitle: title,
            ...confidencePatch,
            searchResult: pipeline.result,
            matchScores: pipeline.matchScores,
            imageScores: pipeline.imageScores,
            highlightTopCandidate: true,
            errorMessage: "标题或图像未达关联门槛，请人工确认",
          });
          bumpProcessed(product, "failed", `${title}：标题或图像未达门槛`);
          continue;
        }

        setCardState(id, "candidates_ready", {
          productTitle: title,
          ...confidencePatch,
          searchResult: pipeline.result,
          matchScores: pipeline.matchScores,
          imageScores: pipeline.imageScores,
          highlightTopCandidate: true,
        });
        await sleep(CANDIDATES_READY_MS);
        if (runId !== runIdRef.current) break;

        if (tier === "medium" || tier === "low") {
          setCardState(id, "needs_review", {
            productTitle: title,
            ...confidencePatch,
            searchResult: pipeline.result,
            matchScores: pipeline.matchScores,
            imageScores: pipeline.imageScores,
            highlightTopCandidate: true,
          });
          bumpProcessed(
            product,
            "needs_review",
            `${title}：${tier === "low" ? "低匹配" : "中匹配"}，待确认货源`
          );
          continue;
        }

        // High confidence — auto select top candidate (same as「选用」).
        const candidatesToTry = pipeline.rankedItems.slice(0, AUTO_BIND_CANDIDATE_LIMIT);
        setCardState(id, "auto_selecting", {
          productTitle: title,
          ...confidencePatch,
          searchResult: pipeline.result,
          matchScores: pipeline.matchScores,
          imageScores: pipeline.imageScores,
          highlightTopCandidate: true,
          selectButtonPhase: "pressed",
        });
        await sleep(SELECT_PRESSED_MS);
        if (runId !== runIdRef.current) break;

        setCardState(id, "binding", {
          productTitle: title,
          ...confidencePatch,
          searchResult: pipeline.result,
          matchScores: pipeline.matchScores,
          imageScores: pipeline.imageScores,
          highlightTopCandidate: true,
          selectButtonPhase: "loading",
        });

        let bound = false;
        let lastErr: unknown = null;
        for (let i = 0; i < candidatesToTry.length; i++) {
          const candidate = candidatesToTry[i]!;
          try {
            const view = await confirmCandidateBinding(
              shopName,
              product,
              candidate,
              pipeline.result,
              {
                auto: true,
                allowPoolIngest: true,
                imageScores: pipeline.imageScores,
                titleScores: pipeline.matchScores,
                locale,
              }
            );
            const acked = await ackAutoLinkedBinding(shopName, id, view);
            onBound(id, acked);
            setCardState(id, "done", {
              productTitle: title,
              ...confidencePatch,
              searchResult: pipeline.result,
              matchScores: pipeline.matchScores,
              imageScores: pipeline.imageScores,
              highlightTopCandidate: true,
              selectButtonPhase: "idle",
              doneFlash: true,
            });
            const suffix =
              i > 0 ? `（已跳过 ${i} 个失效货源）` : "";
            bumpProcessed(product, "linked", `${title}：已自动关联并确认${suffix}`);
            await sleep(DONE_FLASH_MS);
            patchCard(id, { doneFlash: false });
            bound = true;
            break;
          } catch (err) {
            lastErr = err;
            if (!isOfferNotFoundError(err)) break;
          }
        }

        if (!bound) {
          const msg = mapImageMatchConfirmError(lastErr, "绑定失败，请手动选用");
          setCardState(id, "failed", {
            productTitle: title,
            ...confidencePatch,
            searchResult: pipeline.result,
            matchScores: pipeline.matchScores,
            imageScores: pipeline.imageScores,
            highlightTopCandidate: true,
            errorMessage: msg,
            selectButtonPhase: "idle",
          });
          bumpProcessed(product, "failed", `${title}：${msg}`);
        }
      }

      if (runId === runIdRef.current) {
        setProgress((prev) => ({
          ...prev,
          active: false,
          done: true,
          currentProductId: null,
          currentProductTitle: null,
        }));
        runningRef.current = false;
      }
    },
    [onBound, onScrollToProduct, patchCard, setCardState, shopName]
  );

  const reset = useCallback(() => {
    runIdRef.current += 1;
    runningRef.current = false;
    setProgress(INITIAL_BATCH_LINK_PROGRESS);
  }, []);

  /** Clear stale batch failure/review UI after the user manually links or confirms. */
  const markCardResolved = useCallback(
    (productId: string) => {
      patchCard(productId, {
        state: "idle",
        errorMessage: undefined,
        highlightTopCandidate: false,
        selectButtonPhase: "idle",
        doneFlash: false,
      });
    },
    [patchCard]
  );

  const isRunning = progress.active;

  return { progress, start, reset, markCardResolved, isRunning };
}
