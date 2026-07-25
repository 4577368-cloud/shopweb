/**
 * Downscale remote product thumbnails for list/grid (1688 alicdn, Shopify CDN).
 * Safe no-op for unknown hosts.
 */
export function cdnThumbUrl(src: string, pixelWidth = 144): string {
  const raw = src.trim();
  if (!raw || pixelWidth < 1) return raw;

  try {
    if (raw.includes("cdn.shopify.com") || raw.includes("shopifycdn.com")) {
      const url = new URL(raw);
      url.searchParams.set("width", String(pixelWidth));
      url.searchParams.set("height", String(pixelWidth));
      return url.toString();
    }
  } catch {
    // fall through
  }

  if (raw.includes("alicdn.com") || raw.includes("1688.com")) {
    if (/_\d+x\d+/.test(raw)) return raw;
    const q = raw.indexOf("?");
    const base = q >= 0 ? raw.slice(0, q) : raw;
    const query = q >= 0 ? raw.slice(q) : "";
    if (/\.jpe?g$/i.test(base)) {
      const stem = base.replace(/\.jpe?g$/i, "");
      return `${stem}_${pixelWidth}x${pixelWidth}q90.jpg${query}`;
    }
    if (/\.png$/i.test(base)) {
      const stem = base.replace(/\.png$/i, "");
      return `${stem}_${pixelWidth}x${pixelWidth}q90.png${query}`;
    }
    if (/\.webp$/i.test(base)) {
      const stem = base.replace(/\.webp$/i, "");
      return `${stem}_${pixelWidth}x${pixelWidth}q90.webp${query}`;
    }
    const sep = raw.includes("?") ? "&" : "?";
    return `${raw}${sep}x-oss-process=image/resize,w_${pixelWidth}`;
  }

  return raw;
}
