import assert from "node:assert/strict";
import {
  resolveCatalogCardHydration,
  markCatalogCandidatePublished,
  markCatalogCandidateLinked,
  readCatalogPublishedCandidateIds,
  readCatalogLinkedCandidateIds,
} from "@/lib/batch-link/catalog-card-hydration";
import {
  shopProductActivityScore,
} from "@/lib/batch-link/shop-product-activity";
import type { CatalogRecommendation, ImageBindingView } from "@/lib/types";

const item = {
  candidateId: "goods-100",
  title: "Test",
  offerId1688: "offer-9",
} as CatalogRecommendation;

const publishedBinding = {
  bound: true,
  tangbuyProductId: "goods-100",
  bindSource: "FROM_PUBLISH",
} as ImageBindingView;

const linkedBinding = {
  bound: true,
  tangbuyProductId: "goods-100",
  bindSource: "FROM_MANUAL",
} as ImageBindingView;

assert.deepEqual(
  resolveCatalogCardHydration("shop-a", item, [publishedBinding]),
  { published: true, linked: false }
);

assert.deepEqual(
  resolveCatalogCardHydration("shop-a", item, [linkedBinding]),
  { published: false, linked: true }
);

assert.equal(shopProductActivityScore({ a: 100 }, "a", null), 100);
assert.equal(
  shopProductActivityScore({}, "b", "2020-01-01T00:00:00.000Z"),
  Date.parse("2020-01-01T00:00:00.000Z")
);

// localStorage may be unavailable in node — markers should no-op safely
markCatalogCandidatePublished("shop-a", "goods-100");
markCatalogCandidateLinked("shop-a", "goods-100");
assert.ok(readCatalogPublishedCandidateIds("shop-a") instanceof Set);
assert.ok(readCatalogLinkedCandidateIds("shop-a") instanceof Set);

console.log("catalog-card-hydration: ok");
