import sharp from "sharp";
import { normalizeComparableImageUrl } from "@/lib/batch-link/image-match";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Max Hamming distance (64-bit dHash) treated as visually identical. */
export const PERCEPTUAL_HASH_MATCH_MAX_DISTANCE = 8;

/** Floor image score when perceptual hash distance is within threshold. */
export const PERCEPTUAL_HASH_MATCH_FLOOR = 80;

export async function fetchImageBytes(url: string): Promise<Buffer | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(trimmed, {
      signal: controller.signal,
      headers: { "User-Agent": "TangbuyImageMatch/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

/** 64-bit difference hash as 16-char hex. */
export async function computeDHashHex(image: Buffer): Promise<string | null> {
  try {
    const { data } = await sharp(image)
      .rotate()
      .grayscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    let bits = "";
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const left = data[y * 9 + x]!;
        const right = data[y * 9 + x + 1]!;
        bits += left < right ? "1" : "0";
      }
    }

    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex.padStart(16, "0");
  } catch {
    return null;
  }
}

const NIBBLE_POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

export function hammingDistanceHex(a: string, b: string): number | null {
  if (a.length !== b.length) return null;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    dist += NIBBLE_POPCOUNT[xor] ?? 0;
  }
  return dist;
}

export function passesPerceptualMatch(distance: number): boolean {
  return distance <= PERCEPTUAL_HASH_MATCH_MAX_DISTANCE;
}

/** Map Hamming distance to 0–100; identical/near-identical ≥ floor. */
export function perceptualSimilarityFromDistance(distance: number): number {
  if (passesPerceptualMatch(distance)) {
    return Math.max(PERCEPTUAL_HASH_MATCH_FLOOR, 100 - distance * 2);
  }
  return Math.max(0, 100 - distance * 3);
}

export async function hashImageUrl(
  url: string | null | undefined,
  cache: Map<string, string | null>
): Promise<string | null> {
  const key = normalizeComparableImageUrl(url);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  const bytes = await fetchImageBytes(key);
  const hash = bytes ? await computeDHashHex(bytes) : null;
  cache.set(key, hash);
  return hash;
}
