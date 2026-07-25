/**
 * Downscale remote product thumbnails for list/grid (1688 alicdn, Shopify CDN).
 * Safe no-op for unknown hosts.
 */

/** itemGet / bindings often return ...-0-cib without extension; CDN serves ...-0-cib.jpg */
export function normalizeAliProductImageUrl(src: string): string {
  const raw = src.trim();
  if (!raw || !raw.includes("alicdn.com")) return raw;

  const q = raw.indexOf("?");
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const query = q >= 0 ? raw.slice(q) : "";

  const brokenCibThumb = /^(.+-0-cib)_\d+x\d+q90\.(?:jpe?g|png|webp)$/i;
  const broken = path.match(brokenCibThumb);
  if (broken) return `${broken[1]}.jpg${query}`;

  if (/-0-cib$/i.test(path)) return `${path}.jpg${query}`;

  return raw;
}

function isAliCibJpegPath(path: string): boolean {
  return /-0-cib\.jpe?g$/i.test(path);
}

function appendOssResize(url: string, pixelWidth: number): string {
  const withoutOss = url.replace(/[?&]x-oss-process=[^&]*/g, "").replace(/\?$/, "");
  const sep = withoutOss.includes("?") ? "&" : "?";
  return `${withoutOss}${sep}x-oss-process=image/resize,w_${pixelWidth}`;
}

export function cdnThumbUrl(src: string, pixelWidth = 144): string {
  const raw = normalizeAliProductImageUrl(src.trim());
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
    const q = raw.indexOf("?");
    const base = q >= 0 ? raw.slice(0, q) : raw;
    const query = q >= 0 ? raw.slice(q) : "";

    if (isAliCibJpegPath(base)) {
      return appendOssResize(raw, pixelWidth);
    }

    if (/_\d+x\d+/.test(raw)) return raw;

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
    return appendOssResize(raw, pixelWidth);
  }

  return raw;
}
