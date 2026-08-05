import assert from "node:assert/strict";
import {
  batchLinkRunKey,
  buildBatchLinkEscalation,
} from "@/lib/batch-link/escalation";
import {
  INITIAL_BATCH_LINK_PROGRESS,
  formatBatchLinkSummary,
  type BatchLinkCardDrive,
  type BatchLinkProgress,
} from "@/lib/batch-link/types";
import { userFacingImageSearchMessage } from "@/lib/batch-link/match-errors";

function progressOf(
  cards: Record<string, BatchLinkCardDrive>,
  counts?: Partial<BatchLinkProgress>
): BatchLinkProgress {
  const ids = Object.keys(cards);
  return {
    ...INITIAL_BATCH_LINK_PROGRESS,
    active: false,
    done: true,
    total: ids.length,
    processed: ids.length,
    sessionOrder: ids,
    completionOrder: ids,
    cardStates: cards,
    ...counts,
  };
}

// A run where everything linked must not ask for a human.
assert.equal(
  buildBatchLinkEscalation(
    progressOf({
      a: { state: "done", productTitle: "A" },
      b: { state: "done", productTitle: "B" },
    })
  ),
  null
);

// Products needing a manual pick are not failures — no escalation on their own.
assert.equal(
  buildBatchLinkEscalation(
    progressOf({
      a: { state: "done", productTitle: "A" },
      b: { state: "needs_review", productTitle: "B" },
    })
  ),
  null
);

// Several failures collapse into one handover with the dominant reason.
{
  const escalation = buildBatchLinkEscalation(
    progressOf({
      a: { state: "done", productTitle: "A" },
      b: { state: "failed", productTitle: "B", errorMessage: "商品主图无法读取" },
      c: { state: "failed", productTitle: "C", errorMessage: "商品主图无法读取" },
      d: { state: "failed", productTitle: "D", errorMessage: "网关繁忙" },
      e: { state: "needs_review", productTitle: "E" },
    })
  );
  assert.ok(escalation);
  assert.equal(escalation.failedCount, 3);
  assert.equal(escalation.reviewCount, 1);
  assert.deepEqual(escalation.titles, ["B", "C", "D"]);
  assert.equal(escalation.topReason, "商品主图无法读取");
}

// The run key changes between runs so a dismissed prompt comes back next time.
assert.notEqual(
  batchLinkRunKey(progressOf({ a: { state: "failed" } })),
  batchLinkRunKey(progressOf({ b: { state: "failed" } }))
);
assert.equal(batchLinkRunKey(INITIAL_BATCH_LINK_PROGRESS), null);

// Summary separates pending auto-links from hard failures.
assert.match(
  formatBatchLinkSummary(
    progressOf(
      { a: { state: "done" }, b: { state: "failed" } },
      { linked: 1, needsReview: 0, failed: 1 }
    )
  ),
  /1 个已自动关联（待确认）/
);
assert.match(
  formatBatchLinkSummary(
    progressOf(
      { a: { state: "needs_review" }, b: { state: "failed" } },
      { linked: 0, needsReview: 1, failed: 1 }
    )
  ),
  /1 个需复核/
);
assert.match(
  formatBatchLinkSummary(
    progressOf(
      { a: { state: "needs_review" }, b: { state: "failed" } },
      { linked: 0, needsReview: 1, failed: 1 }
    )
  ),
  /1 个失败/
);

// Machine codes and raw image URLs never reach the card.
assert.equal(
  userFacingImageSearchMessage(
    "IMAGE_UNREADABLE: 无法下载图片(https://cdn.shopify.com/s/files/1/1019/0936/x.jpg?v=1784880236)"
  ),
  "商品主图无法读取，请换清晰主图或用手动匹配"
);
assert.equal(userFacingImageSearchMessage(null), "图搜失败，请稍后重试");
assert.equal(userFacingImageSearchMessage("未找到可靠候选"), "未找到可靠候选");
assert.ok(!/https?:\/\//.test(userFacingImageSearchMessage("https://x.test/a.jpg")));

console.log("✓ batch-link escalation tests passed");
