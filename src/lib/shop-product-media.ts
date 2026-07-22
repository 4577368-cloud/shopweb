import type { ShopMirrorMedia } from "@/lib/types";

/** Stable id for delete payloads — prefers Shopify media GID. */
export function resolveShopMediaId(media: ShopMirrorMedia): string {
  const gid = media.mediaId?.trim();
  if (gid) return gid;
  return String(media.id);
}

export function isFeaturedShopMedia(
  media: ShopMirrorMedia,
  index: number
): boolean {
  if (media.position === 1) return true;
  return index === 0;
}

/** Images embedded inside description HTML (detail body) — not product gallery media. */
export function extractHtmlImageUrls(html?: string | null): string[] {
  if (!html?.trim()) return [];
  const urls: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const url = match[1]?.trim();
    if (url) urls.push(url);
  }
  return urls;
}
