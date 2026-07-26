import assert from "node:assert/strict";
import { api } from "@/lib/api";
import { MULTI_IMAGE_SEARCH_ENABLED } from "@/lib/batch-link/image-search-flags";
import { runImageSearchPipeline } from "@/lib/batch-link/image-search-pipeline";
import { loadVariantImagesForImageSearch } from "@/lib/batch-link/variant-images-for-search";
import type { ImageSearchResult } from "@/lib/types";

type ImageSearchOpts = { country?: string; searchImageUrl?: string };

const calls: Array<{ limit: number; opts?: ImageSearchOpts }> = [];
const originalImageSearch = api.imageSearch;

api.imageSearch = (async (
  _shop: string,
  _itemId: string,
  limit = 4,
  opts?: ImageSearchOpts
): Promise<ImageSearchResult> => {
  calls.push({ limit, opts });
  const result: ImageSearchResult = {
    items: [],
    imageSource: "SHOPIFY",
    querySource: "NONE",
    appliedQuery: null,
  };
  return result;
}) as typeof api.imageSearch;

async function main() {
  // The backend could not download explicit query images, so image search must
  // stay on the original path where it picks the shop image itself.
  assert.equal(MULTI_IMAGE_SEARCH_ENABLED, false);

  // Variant images are offered by every caller; they must not reach the request.
  const result = await runImageSearchPipeline(
    "demo-shop",
    {
      thirdPlatformItemId: "gid://shopify/Product/1",
      title: "Summer dress",
      primaryImageUrl:
        "https://cdn.shopify.com/s/files/1/1019/0936/5028/files/O1CN01ZHXpe31NdlJyT5hbc.jpg?v=1",
    },
    5,
    {
      variantImages: [
        {
          imageUrl: "https://cdn.shopify.com/s/files/1/1019/0936/5028/files/VarA.jpg",
          price: 20,
          thirdPlatformSkuId: "sku-a",
        },
        {
          imageUrl: "https://cdn.shopify.com/s/files/1/1019/0936/5028/files/VarB.jpg",
          price: 10,
          thirdPlatformSkuId: "sku-b",
        },
      ],
    }
  );

  assert.equal(result.error, null);
  assert.equal(calls.length, 1, "exactly one image-search request per run");
  assert.equal(calls[0]!.limit, 5);
  assert.equal(
    calls[0]!.opts?.searchImageUrl,
    undefined,
    "no explicit search image is sent to the backend"
  );

  // The extra product-detail round-trip is skipped too.
  assert.equal(
    await loadVariantImagesForImageSearch("demo-shop", "gid://shopify/Product/1"),
    undefined
  );

  console.log("✓ image-search request shape tests passed");
}

void main().finally(() => {
  api.imageSearch = originalImageSearch;
});
