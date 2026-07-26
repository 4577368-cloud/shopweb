/**
 * Similarity-first ranking: sold must not reorder when scores are missing.
 * Run: npx tsx src/lib/batch-link/test-similarity-first-rank.ts
 */
import { compareCandidates, pickBestCandidateIndex } from "@/lib/agents/products/match-rank";
import { rankCandidatesWithImageGate } from "@/lib/batch-link/image-match";
import type { ImageSearchProduct } from "@/lib/types";

function item(
  id: string,
  sold: number,
  extras?: Partial<ImageSearchProduct>
): ImageSearchProduct {
  return {
    productId: id,
    title: id,
    soldCount: sold,
    similarityScore: null,
    ...extras,
  };
}

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.log(`✗ ${msg}`);
  } else {
    console.log(`✓ ${msg}`);
  }
}

const gatewayOrder = [item("first", 10), item("popular", 999_999)];
assert(pickBestCandidateIndex(gatewayOrder) === 0, "pickBest: null similarity keeps gateway #1");
assert(
  compareCandidates(gatewayOrder[1]!, gatewayOrder[0]!) === 0,
  "compare: null similarity does not prefer higher sold"
);

const withScores = [
  item("popular", 500_000, { similarityScore: 0.6 }),
  item("lookalike", 12, { similarityScore: 0.95 }),
];
assert(pickBestCandidateIndex(withScores) === 1, "pickBest: higher similarity beats sold");

const ranked = rankCandidatesWithImageGate(
  gatewayOrder,
  {},
  { first: null, popular: null }
);
assert(ranked[0]?.productId === "first", "image-gate: pending scores keep gateway order");

const tiedImage = rankCandidatesWithImageGate(
  [item("a", 10), item("b", 999)],
  { a: 90, b: 90 },
  { a: 88, b: 88 }
);
assert(tiedImage[0]?.productId === "b", "image-gate: tied similarity may use sold");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall ok");
