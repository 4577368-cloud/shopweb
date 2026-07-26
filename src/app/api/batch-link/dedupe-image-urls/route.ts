import { NextResponse } from "next/server";
import {
  hammingDistanceHex,
  hashImageUrl,
  passesPerceptualMatch,
} from "@/lib/batch-link/perceptual-hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IN = 24;

/**
 * POST /api/batch-link/dedupe-image-urls
 * Collapse visually identical images (dHash) and return representative URLs in input order.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const raw = (body as { urls?: unknown }).urls;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ urls: [] });
  }

  const urls = raw
    .map((u) => String(u ?? "").trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, MAX_IN);

  if (urls.length <= 1) {
    return NextResponse.json({ urls });
  }

  const cache = new Map<string, string | null>();
  const representatives: string[] = [];
  const repHashes: string[] = [];

  for (const url of urls) {
    const hash = await hashImageUrl(url, cache);
    if (!hash) {
      representatives.push(url);
      continue;
    }
    let merged = false;
    for (let i = 0; i < repHashes.length; i++) {
      const dist = hammingDistanceHex(hash, repHashes[i]!);
      if (dist != null && passesPerceptualMatch(dist)) {
        merged = true;
        break;
      }
    }
    if (!merged) {
      representatives.push(url);
      repHashes.push(hash);
    }
  }

  return NextResponse.json({ urls: representatives });
}
