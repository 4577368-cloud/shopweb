import { parseGatewayPrice } from "@/lib/agents/products/match-rank";
import { resolve1688ProductTitle } from "@/lib/batch-link/1688-title-locale";
import type { Locale } from "@/i18n/config";
import type { ImageSearchProduct } from "@/lib/types";

export type AutoBindIncompleteReason =
  | "missing_image"
  | "missing_title"
  | "missing_price";

/** Snapshot fields required before auto PENDING-bind — avoids empty/broken first hits. */
export function inspectAutoBindSnapshot(
  candidate: Pick<
    ImageSearchProduct,
    | "imageUrl"
    | "price"
    | "title"
    | "titleTrans"
    | "subject"
    | "subjectTrans"
    | "englishTitle"
  >,
  locale: Locale
): { ok: true } | { ok: false; reasons: AutoBindIncompleteReason[] } {
  const reasons: AutoBindIncompleteReason[] = [];
  if (!candidate.imageUrl?.trim()) reasons.push("missing_image");

  const title = resolve1688ProductTitle({
    locale,
    title: candidate.title,
    titleTrans: candidate.titleTrans,
    subject: candidate.subject,
    subjectTrans: candidate.subjectTrans,
    englishTitle: candidate.englishTitle,
  })?.trim();
  if (!title) reasons.push("missing_title");

  if (parseGatewayPrice(candidate.price) == null) reasons.push("missing_price");

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function isAutoBindSnapshotComplete(
  candidate: Parameters<typeof inspectAutoBindSnapshot>[0],
  locale: Locale
): boolean {
  return inspectAutoBindSnapshot(candidate, locale).ok;
}

/** Prefer complete candidates among the top N; fall back to scanning further ranked hits. */
export function pickAutoBindCandidates(
  ranked: ImageSearchProduct[],
  locale: Locale,
  limit: number
): ImageSearchProduct[] {
  const complete = ranked.filter((c) => isAutoBindSnapshotComplete(c, locale));
  return complete.slice(0, limit);
}

export function formatAutoBindIncompleteMessage(
  reasons: AutoBindIncompleteReason[]
): string {
  const labels: string[] = [];
  if (reasons.includes("missing_image")) labels.push("缺图");
  if (reasons.includes("missing_title")) labels.push("缺标题");
  if (reasons.includes("missing_price")) labels.push("缺采购价");
  if (labels.length === 0) return "候选信息不完整，请手动选用";
  return `候选信息不完整（${labels.join("/")}），请手动选用`;
}
