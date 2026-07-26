import assert from "node:assert/strict";
import {
  collectVariantImageCandidates,
  pickRepresentativeVariantImageUrls,
} from "@/lib/sku-align/representative-variant-images";

// CDN paths are case-sensitive: a lower-cased URL 404s and the backend then
// reports IMAGE_UNREADABLE, so the original casing must survive dedupe.
{
  const mixedCase =
    "https://cdn.shopify.com/s/files/1/1019/0936/5028/files/O1CN01ZHXpe31NdlJyT5hbc__2219716535112-0-cib.jpg?v=1784880236";
  const candidates = collectVariantImageCandidates(
    [{ imageUrl: mixedCase, price: 12, thirdPlatformSkuId: "s1" }],
    null
  );
  assert.deepEqual(
    candidates.map((c) => c.url),
    [mixedCase]
  );
}

// Same image referenced with different casing/hash still collapses to one entry.
{
  const a = "https://cdn.test/Files/AbC.jpg";
  const b = "https://cdn.test/files/abc.jpg#frag";
  const candidates = collectVariantImageCandidates(
    [
      { imageUrl: a, price: 5, thirdPlatformSkuId: "s1" },
      { imageUrl: b, price: 9, thirdPlatformSkuId: "s2" },
    ],
    null
  );
  assert.equal(candidates.length, 1);
  // Higher price wins, and its original casing is kept.
  assert.equal(candidates[0]!.url, b);
}

// Primary image is kept verbatim and ranks last.
{
  const primary = "https://cdn.test/Primary-IMG.jpg";
  const variant = "https://cdn.test/Variant-A.jpg";
  const candidates = collectVariantImageCandidates(
    [{ imageUrl: variant, price: 3, thirdPlatformSkuId: "s1" }],
    primary
  );
  const urls = candidates.map((c) => c.url);
  assert.ok(urls.includes(primary));
  assert.ok(urls.includes(variant));
}

async function main() {
// Selection keeps original URLs and honours the cap.
{
  const urls = await pickRepresentativeVariantImageUrls(
    [
      { imageUrl: "https://cdn.test/A1.jpg", price: 30, thirdPlatformSkuId: "1" },
      { imageUrl: "https://cdn.test/B2.jpg", price: 20, thirdPlatformSkuId: "2" },
      { imageUrl: "https://cdn.test/C3.jpg", price: 10, thirdPlatformSkuId: "3" },
      { imageUrl: "https://cdn.test/D4.jpg", price: 5, thirdPlatformSkuId: "4" },
    ],
    "https://cdn.test/Primary.jpg"
  );
  assert.equal(urls.length, 3);
  assert.deepEqual(urls, [
    "https://cdn.test/A1.jpg",
    "https://cdn.test/B2.jpg",
    "https://cdn.test/C3.jpg",
  ]);
  assert.ok(urls.every((u) => !/^https:\/\/cdn\.test\/[a-z0-9.]+$/.test(u)));
}

// No variants at all falls back to the primary image, unchanged.
{
  const urls = await pickRepresentativeVariantImageUrls(
    [],
    "https://cdn.test/OnlyPrimary.JPG"
  );
  assert.deepEqual(urls, ["https://cdn.test/OnlyPrimary.JPG"]);
}

console.log("✓ representative variant image tests passed");
}

void main();
