import assert from "node:assert/strict";
import {
  formatAutoBindIncompleteMessage,
  inspectAutoBindSnapshot,
  isAutoBindSnapshotComplete,
  pickAutoBindCandidates,
} from "@/lib/batch-link/auto-bind-eligibility";
import type { ImageSearchProduct } from "@/lib/types";

function candidate(
  patch: Partial<ImageSearchProduct> & { productId: string }
): ImageSearchProduct {
  return {
    title: "完整标题",
    imageUrl: "https://img.example/a.jpg",
    price: "12.5",
    ...patch,
  } as ImageSearchProduct;
}

assert.equal(
  isAutoBindSnapshotComplete(
    candidate({ productId: "1" }),
    "zh"
  ),
  true
);

assert.deepEqual(
  inspectAutoBindSnapshot(
    candidate({ productId: "2", imageUrl: "", price: undefined, title: "" }),
    "zh"
  ),
  { ok: false, reasons: ["missing_image", "missing_title", "missing_price"] }
);

assert.equal(
  isAutoBindSnapshotComplete(
    candidate({ productId: "3", price: "采购价未知" }),
    "zh"
  ),
  false
);

const ranked = [
  candidate({ productId: "bad", imageUrl: undefined, price: null }),
  candidate({ productId: "good", title: "可用货源" }),
  candidate({ productId: "good2" }),
];
const picked = pickAutoBindCandidates(ranked, "zh", 5);
assert.equal(picked.length, 2);
assert.equal(picked[0]!.productId, "good");

assert.match(
  formatAutoBindIncompleteMessage(["missing_image", "missing_price"]),
  /缺图\/缺采购价/
);

console.log("auto-bind-eligibility: ok");
