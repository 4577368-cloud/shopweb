import { cdnThumbUrl, normalizeAliProductImageUrl } from "@/lib/images/cdn-thumb-url";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const shopify =
  "https://cdn.shopify.com/s/files/1/000/001/products/a.jpg?v=1";
assert(cdnThumbUrl(shopify, 120).includes("width=120"), "shopify width");

const ali =
  "https://cbu01.alicdn.com/img/ibank/O1CN01.jpg";
const aliOut = cdnThumbUrl(ali, 120);
assert(aliOut.includes("_120x120q90"), `alicdn resize: ${aliOut}`);
assert(!aliOut.includes(".jpg_"), `alicdn must not double extension: ${aliOut}`);
assert(
  aliOut.endsWith("_120x120q90.jpg"),
  `alicdn suffix: ${aliOut}`
);

const cibBare =
  "https://cbu01.alicdn.com/img/ibank/O1CN01Gqod7g1b0AWdFKg3u_!!2220764753402-0-cib";
assert(
  normalizeAliProductImageUrl(cibBare).endsWith("-0-cib.jpg"),
  "normalize -0-cib suffix"
);
const cibThumb = cdnThumbUrl(cibBare, 144);
assert(
  cibThumb.includes("x-oss-process=image/resize,w_144"),
  `cib uses oss resize: ${cibThumb}`
);
assert(
  !cibThumb.includes("_144x144q90"),
  `cib must not use _WxH thumb: ${cibThumb}`
);

const brokenServerThumb =
  "https://cbu01.alicdn.com/O1CN01uyVmtC1gTY1NrqBv1_!!2220860834143-0-cib_144x144q90.jpg";
assert(
  normalizeAliProductImageUrl(brokenServerThumb).endsWith("-0-cib.jpg"),
  "fix broken server thumb"
);

console.log("✓ cdn-thumb-url cases passed");
