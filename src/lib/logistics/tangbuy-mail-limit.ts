/**
 * Tangbuy 商品邮限（mailLimitList）+ 物流模板邮限规则（limitsMailList）。
 * 浏览器直连 tangbuy.cc；失败时调用方回退关键词分类。
 *
 * listing/page 按「登录账号绑定的店铺商品」返回 — 使用当前用户门户 JWT。
 */
import type {
  LogisticsAnalysis,
  LogisticsTypeCode,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";
import {
  computeVariantDecisionStatus,
  DEFAULT_DECISION_COUNTS,
} from "@/lib/logistics/decision-engine";
import { requirePortalMallToken } from "@/lib/auth/portal-token";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";

const LISTING_PATH = "/gateway/plugin/third/platform/product/listing/page";
const TEMPLATE_BY_GOODS_PATH =
  "/gateway/plugin/logistics/template/listTemplateByGoods";

export interface TangbuyMailLimit {
  mailLimitPid: number;
  mailLimitId: number;
  firstName: string;
  secondName: string;
}

export interface TangbuyMailLimitIds {
  firstLimitId: number;
  secondLimitId: number;
}

export interface ProductMailLimitInfo {
  thirdPlatformItemId: string;
  mailLimits: TangbuyMailLimit[];
  /** 用于 estimate 的 postLimitType 映射源 */
  postalLimitClass: string;
  postalLimitLabel: string;
}

export type MailLimitFetchReason =
  | "ok"
  | "not_configured"
  | "listing_empty"
  | "listing_error"
  | "no_match"
  | "enrich_error";

export interface MailLimitEnrichMeta {
  reason: MailLimitFetchReason;
  listingTotal: number;
  mappedProducts: number;
  matchedProducts: number;
  detail?: string;
  usedListingToken: boolean;
}

export interface MailLimitEnrichResult {
  analysis: LogisticsAnalysis;
  meta: MailLimitEnrichMeta;
}

function gatewayBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL ?? "https://tangbuy.cc"
  ).replace(/\/+$/, "");
}

/** Prefer optional listing override; else current user portal token. */
function listingToken(): { token: string; usedListingToken: boolean } {
  const listing = process.env.NEXT_PUBLIC_TANGBUY_LISTING_TOKEN?.trim();
  if (listing) return { token: listing, usedListingToken: true };
  return { token: requirePortalMallToken(), usedListingToken: false };
}

function listingHeaders(token: string): HeadersInit {
  // listing/page 来自 www.tangbuy.cc 商家控制台，Origin 对齐该站
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    Origin: "https://www.tangbuy.cc",
    Referer: "https://www.tangbuy.cc/",
    currency: "CNY",
    device: "pc",
    lang: "cn",
    "tang-request-device": "web",
    "tang-request-render": "csr",
    "tang-request-rewrite": "true",
  };
}

function templateHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    Origin: "https://dropshipping.tangbuy.cc",
    Referer: "https://dropshipping.tangbuy.cc/",
    currency: "CNY",
    device: "pc",
    lang: "cn",
    "tang-request-device": "web",
    "tang-request-render": "csr",
    "tang-request-rewrite": "true",
  };
}

/** secondName / 常见 ID → 工作台 postalLimitClass */
const SECOND_NAME_TO_CLASS: Array<{ match: RegExp; postalClass: string }> = [
  { match: /内置电池|内电/, postalClass: "BATTERY_BUILT_IN" },
  { match: /配套电池|外电|纯电/, postalClass: "BATTERY_EXTERNAL" },
  { match: /带磁|含磁/, postalClass: "MAGNETIC" },
  { match: /液体|含液/, postalClass: "LIQUID" },
  { match: /粉末|粉状/, postalClass: "POWDER" },
  { match: /食品/, postalClass: "FOOD" },
  { match: /刀具|带刀|刀片/, postalClass: "BLADE" },
  { match: /易碎|玻璃|陶瓷/, postalClass: "FRAGILE" },
  { match: /化妆|美妆/, postalClass: "COSMETIC" },
  { match: /普货/, postalClass: "GENERAL" },
];

/** 已知一级/二级 ID 对（来自 tangbuy.cc 实测） */
const KNOWN_ID_PAIR_CLASS: Record<string, string> = {
  "75:63": "GENERAL", // 服饰 / 普货
};

export function mailLimitToPostalClass(
  limit: Pick<TangbuyMailLimit, "mailLimitPid" | "mailLimitId" | "secondName">
): string {
  const pairKey = `${limit.mailLimitPid}:${limit.mailLimitId}`;
  if (KNOWN_ID_PAIR_CLASS[pairKey]) return KNOWN_ID_PAIR_CLASS[pairKey]!;

  const name = limit.secondName?.trim() ?? "";
  for (const row of SECOND_NAME_TO_CLASS) {
    if (row.match.test(name)) return row.postalClass;
  }
  return name ? "OTHER" : "GENERAL";
}

export function formatMailLimitLabel(limits: TangbuyMailLimit[]): string {
  const primary = limits[0];
  if (!primary) return "";
  const first = primary.firstName?.trim() ?? "";
  const second = primary.secondName?.trim() ?? "";
  if (first && second) return `${first} / ${second}`;
  return second || first;
}

/** postalLimitClass → 画像 dominantLogisticsType（粗粒度枚举） */
export function postalClassToDominantType(
  postalClass: string
): LogisticsTypeCode {
  switch (postalClass.toUpperCase()) {
    case "GENERAL":
      return "GENERAL";
    case "APPAREL":
      return "APPAREL";
    case "FOOD":
      return "FOOD";
    case "BATTERY_BUILT_IN":
    case "BATTERY_EXTERNAL":
    case "MAGNETIC":
    case "BATTERY_MAGNETIC":
      return "BATTERY_MAGNETIC";
    case "BLADE":
      return "BLADE";
    case "LIQUID":
      return "LIQUID";
    case "POWDER":
      return "POWDER";
    case "FRAGILE":
      return "FRAGILE";
    case "COSMETIC":
      return "COSMETIC";
    default:
      return "OTHER";
  }
}

function parseMailLimitList(raw: unknown): TangbuyMailLimit[] {
  if (!Array.isArray(raw)) return [];
  const out: TangbuyMailLimit[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const pid = Number(o.mailLimitPid ?? o.firstLimitId);
    const id = Number(o.mailLimitId ?? o.secondLimitId);
    if (!Number.isFinite(pid) || !Number.isFinite(id)) continue;
    out.push({
      mailLimitPid: pid,
      mailLimitId: id,
      firstName: String(o.firstName ?? o.firstLimitName ?? "").trim(),
      secondName: String(o.secondName ?? o.secondLimitName ?? "").trim(),
    });
  }
  return out;
}

function shopUniqueKey(shopName: string): string {
  const short = shopName.trim().replace(/\.myshopify\.com$/i, "");
  return `${short}_SHOPIFY`;
}

interface ListingRow {
  thirdPlatformItemId?: string | number | null;
  thirdPlatformGraphqlApiId?: string | null;
  mailLimitList?: unknown;
}

function extractListingPage(data: Record<string, unknown>): {
  total: number;
  rows: ListingRow[];
  code?: number;
  msg?: string;
} {
  const nested =
    data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : null;
  const rowsRaw = (data.rows ?? nested?.rows ?? []) as ListingRow[] | null;
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const totalRaw = data.total ?? nested?.total ?? rows.length;
  const total = Number(totalRaw);
  return {
    total: Number.isFinite(total) ? total : rows.length,
    rows,
    code: typeof data.code === "number" ? data.code : undefined,
    msg:
      (typeof data.msg === "string" && data.msg) ||
      (typeof data.message === "string" && data.message) ||
      undefined,
  };
}

export interface FetchMailLimitsResult {
  map: Map<string, ProductMailLimitInfo>;
  listingTotal: number;
  usedListingToken: boolean;
  error?: string;
}

/**
 * 拉取店铺商品 listing 上的 mailLimitList，按 Shopify itemId 建索引。
 */
export async function fetchShopProductMailLimits(
  shopName: string,
  opts?: { pageSize?: number; maxPages?: number; signal?: AbortSignal }
): Promise<FetchMailLimitsResult> {
  const map = new Map<string, ProductMailLimitInfo>();
  if (!isMallGatewayConfigured() || !shopName.trim()) {
    return {
      map,
      listingTotal: 0,
      usedListingToken: false,
      error: "not_configured",
    };
  }

  const { token, usedListingToken } = listingToken();
  const pageSize = opts?.pageSize ?? 50;
  const maxPages = opts?.maxPages ?? 40;
  const uniqueKey = shopUniqueKey(shopName);
  const shortShop = shopName.trim().replace(/\.myshopify\.com$/i, "");
  let listingTotal = 0;

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
      if (opts?.signal?.aborted) break;

      const res = await fetch(`${gatewayBaseUrl()}${LISTING_PATH}`, {
        method: "POST",
        signal: opts?.signal,
        headers: listingHeaders(token),
        body: JSON.stringify({
          pageNum,
          pageSize,
          uniqueKey,
          thirdPlatformShopName: shortShop,
          thirdShopPlatform: "SHOPIFY",
        }),
      });

      const text = await res.text();
      let raw: Record<string, unknown>;
      try {
        raw = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        return {
          map,
          listingTotal,
          usedListingToken,
          error: `listing JSON 解析失败 (${res.status})`,
        };
      }

      const page = extractListingPage(raw);
      if (!res.ok || (page.code != null && page.code !== 200)) {
        const msg = page.msg ?? `HTTP ${res.status}`;
        if (typeof console !== "undefined") {
          console.warn("[tangbuy/mail-limit] listing/page failed", msg);
        }
        return {
          map,
          listingTotal,
          usedListingToken,
          error: String(msg),
        };
      }

      if (pageNum === 1) listingTotal = page.total;
      const rows = page.rows;
      for (const row of rows) {
        const itemId = String(row.thirdPlatformItemId ?? "").trim();
        if (!itemId) continue;
        const mailLimits = parseMailLimitList(row.mailLimitList);
        if (!mailLimits.length) continue;
        const primary = mailLimits[0]!;
        const info: ProductMailLimitInfo = {
          thirdPlatformItemId: itemId,
          mailLimits,
          postalLimitClass: mailLimitToPostalClass(primary),
          postalLimitLabel: formatMailLimitLabel(mailLimits),
        };
        map.set(itemId, info);
        const gid = String(row.thirdPlatformGraphqlApiId ?? "").trim();
        const gidNum = gid.match(/Product\/(\d+)/)?.[1];
        if (gidNum && gidNum !== itemId) map.set(gidNum, info);
      }

      if (rows.length < pageSize || pageNum * pageSize >= page.total) break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (typeof console !== "undefined") {
      console.warn("[tangbuy/mail-limit] listing fetch error", err);
    }
    return { map, listingTotal, usedListingToken, error: msg };
  }

  return { map, listingTotal, usedListingToken };
}

export interface TangbuyLogisticsTemplateLane {
  countryCode: string;
  templateId: number;
  templateName: string;
  lineId?: number;
  lineName?: string;
  allowed: TangbuyMailLimitIds[];
  disabled: TangbuyMailLimitIds[];
}

function parseLimitIds(raw: unknown): TangbuyMailLimitIds[] {
  if (!Array.isArray(raw)) return [];
  const out: TangbuyMailLimitIds[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const first = Number(o.firstLimitId ?? o.mailLimitPid);
    const second = Number(o.secondLimitId ?? o.mailLimitId);
    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;
    out.push({ firstLimitId: first, secondLimitId: second });
  }
  return out;
}

/** 用户物流模板（按国家），含允许/禁用邮限。失败返回空数组。 */
export async function fetchLogisticsTemplatesByGoods(opts?: {
  uniqueKey?: string;
  signal?: AbortSignal;
}): Promise<TangbuyLogisticsTemplateLane[]> {
  if (!isMallGatewayConfigured()) return [];
  try {
    const { token } = listingToken();
    const body: Record<string, unknown> = {};
    if (opts?.uniqueKey?.trim()) body.uniqueKey = opts.uniqueKey.trim();

    const res = await fetch(`${gatewayBaseUrl()}${TEMPLATE_BY_GOODS_PATH}`, {
      method: "POST",
      signal: opts?.signal,
      headers: templateHeaders(token),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: {
      code?: number;
      msg?: string;
      data?: {
        activeLineList?: Array<{
          countryCode?: string;
          templateList?: Array<{
            id?: number;
            name?: string;
            config?: {
              lineId?: number;
              lineName?: string;
              limitsMailList?: unknown;
              disableLimitsMailList?: unknown;
            };
            disableLimitsMailList?: unknown;
          }>;
        }>;
      };
    };
    try {
      data = text ? (JSON.parse(text) as typeof data) : {};
    } catch {
      return [];
    }
    if (!res.ok || (data.code != null && data.code !== 200)) {
      if (typeof console !== "undefined") {
        console.warn(
          "[tangbuy/mail-limit] listTemplateByGoods failed",
          data.msg ?? res.status
        );
      }
      return [];
    }

    const lanes: TangbuyLogisticsTemplateLane[] = [];
    for (const country of data.data?.activeLineList ?? []) {
      const countryCode = String(country.countryCode ?? "")
        .trim()
        .toUpperCase();
      if (!countryCode) continue;
      for (const tpl of country.templateList ?? []) {
        const cfg = tpl.config;
        const allowed = parseLimitIds(cfg?.limitsMailList);
        const disabled = parseLimitIds(
          tpl.disableLimitsMailList ?? cfg?.disableLimitsMailList
        );
        lanes.push({
          countryCode,
          templateId: Number(tpl.id) || 0,
          templateName: String(tpl.name ?? cfg?.lineName ?? "").trim(),
          lineId: cfg?.lineId,
          lineName: cfg?.lineName,
          allowed,
          disabled,
        });
      }
    }
    return lanes;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[tangbuy/mail-limit] listTemplateByGoods error", err);
    }
    return [];
  }
}

export function mailLimitAllowedForCountry(
  limit: TangbuyMailLimit,
  countryCode: string,
  lanes: TangbuyLogisticsTemplateLane[]
): { ok: boolean; reason?: string; matchingTemplates: string[] } {
  const code = countryCode.trim().toUpperCase();
  const countryLanes = lanes.filter((l) => l.countryCode === code);
  if (!countryLanes.length) {
    return { ok: true, matchingTemplates: [] };
  }

  const pair = (a: TangbuyMailLimitIds) =>
    a.firstLimitId === limit.mailLimitPid &&
    a.secondLimitId === limit.mailLimitId;

  const matching: string[] = [];
  for (const lane of countryLanes) {
    if (lane.disabled.some(pair)) continue;
    if (lane.allowed.length > 0 && !lane.allowed.some(pair)) continue;
    matching.push(lane.templateName || lane.lineName || String(lane.templateId));
  }

  if (matching.length === 0) {
    return {
      ok: false,
      reason: `邮限「${formatMailLimitLabel([limit])}」在 ${code} 无可用物流模板`,
      matchingTemplates: [],
    };
  }
  return { ok: true, matchingTemplates: matching };
}

function recomputeProfile(
  profile: ProductLogisticsProfile
): ProductLogisticsProfile {
  const variantDecisions = profile.variantDecisions.map((v) => {
    if (v.decisionConfirmed || v.decisionStatus === "restricted") {
      return v;
    }
    const { status, reason } = computeVariantDecisionStatus(v);
    return {
      ...v,
      decisionStatus: status,
      decisionReason: reason,
    };
  });
  const decisionStatusCounts = variantDecisions.reduce(
    (acc, v) => {
      acc[v.decisionStatus] = (acc[v.decisionStatus] ?? 0) + 1;
      return acc;
    },
    { ...DEFAULT_DECISION_COUNTS }
  );
  return {
    ...profile,
    variantDecisions,
    decisionStatusCounts,
    totalVariants: variantDecisions.length,
  };
}

/**
 * 用 listing 邮限覆盖分析画像；查不到的商品保留原关键词分类。
 */
export function applyMailLimitsToAnalysis(
  analysis: LogisticsAnalysis,
  mailByItemId: Map<string, ProductMailLimitInfo>,
  opts?: {
    countryCode?: string | null;
    templateLanes?: TangbuyLogisticsTemplateLane[];
  }
): { analysis: LogisticsAnalysis; matchedProducts: number } {
  if (!mailByItemId.size) {
    return { analysis, matchedProducts: 0 };
  }

  const countryCode = opts?.countryCode?.trim().toUpperCase() || null;
  const lanes = opts?.templateLanes ?? [];
  let matchedProducts = 0;

  const productProfiles = analysis.productProfiles.map((profile) => {
    const info = mailByItemId.get(profile.thirdPlatformItemId);
    if (!info) return profile;
    matchedProducts += 1;

    const primary = info.mailLimits[0];
    let restrictedReason: string | undefined;
    if (primary && countryCode && lanes.length) {
      const gate = mailLimitAllowedForCountry(primary, countryCode, lanes);
      if (!gate.ok) restrictedReason = gate.reason;
    }

    const variantDecisions: VariantLogisticsDecision[] =
      profile.variantDecisions.map((v) => {
        const next: VariantLogisticsDecision = {
          ...v,
          postalLimitClass: info.postalLimitClass,
          postalLimitLabel: info.postalLimitLabel,
          postalLimitConfidence: 1,
          mailLimitPid: primary?.mailLimitPid,
          mailLimitId: primary?.mailLimitId,
        };
        if (restrictedReason && !v.decisionConfirmed) {
          next.decisionStatus = "restricted";
          next.decisionReason = restrictedReason;
        }
        return next;
      });

    return recomputeProfile({
      ...profile,
      dominantLogisticsType: postalClassToDominantType(info.postalLimitClass),
      dominantLogisticsTypeLabel: info.postalLimitLabel,
      variantDecisions,
    });
  });

  const allVariants = productProfiles.flatMap((p) => p.variantDecisions);
  const decisionStatusCounts = { ...DEFAULT_DECISION_COUNTS };
  for (const v of allVariants) {
    decisionStatusCounts[v.decisionStatus] =
      (decisionStatusCounts[v.decisionStatus] ?? 0) + 1;
  }

  return {
    analysis: {
      ...analysis,
      productProfiles,
      decisionStatusCounts,
      totalVariants: allVariants.length,
    },
    matchedProducts,
  };
}

/** 分析加载后：拉邮限并合并（浏览器侧）。 */
export async function enrichAnalysisWithTangbuyMailLimits(
  analysis: LogisticsAnalysis,
  shopName: string,
  opts?: { countryCode?: string | null; signal?: AbortSignal }
): Promise<MailLimitEnrichResult> {
  if (!isMallGatewayConfigured()) {
    return {
      analysis,
      meta: {
        reason: "not_configured",
        listingTotal: 0,
        mappedProducts: 0,
        matchedProducts: 0,
        usedListingToken: false,
      },
    };
  }
  try {
    const [fetched, templateLanes] = await Promise.all([
      fetchShopProductMailLimits(shopName, { signal: opts?.signal }),
      fetchLogisticsTemplatesByGoods({
        uniqueKey: shopUniqueKey(shopName),
        signal: opts?.signal,
      }),
    ]);

    if (fetched.error && !fetched.map.size) {
      return {
        analysis,
        meta: {
          reason: "listing_error",
          listingTotal: fetched.listingTotal,
          mappedProducts: 0,
          matchedProducts: 0,
          detail: fetched.error,
          usedListingToken: fetched.usedListingToken,
        },
      };
    }

    if (!fetched.map.size) {
      if (typeof console !== "undefined") {
        console.info(
          "[tangbuy/mail-limit] listing returned no mailLimit rows for",
          shopName,
          "total=",
          fetched.listingTotal,
          "listingToken=",
          fetched.usedListingToken,
          "— keeping classifier postal limits"
        );
      }
      return {
        analysis,
        meta: {
          reason: "listing_empty",
          listingTotal: fetched.listingTotal,
          mappedProducts: 0,
          matchedProducts: 0,
          usedListingToken: fetched.usedListingToken,
        },
      };
    }

    const applied = applyMailLimitsToAnalysis(analysis, fetched.map, {
      countryCode: opts?.countryCode,
      templateLanes,
    });

    if (applied.matchedProducts <= 0) {
      return {
        analysis,
        meta: {
          reason: "no_match",
          listingTotal: fetched.listingTotal,
          mappedProducts: fetched.map.size,
          matchedProducts: 0,
          usedListingToken: fetched.usedListingToken,
        },
      };
    }

    return {
      analysis: applied.analysis,
      meta: {
        reason: "ok",
        listingTotal: fetched.listingTotal,
        mappedProducts: fetched.map.size,
        matchedProducts: applied.matchedProducts,
        usedListingToken: fetched.usedListingToken,
      },
    };
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[tangbuy/mail-limit] enrich failed, keeping classifier", err);
    }
    return {
      analysis,
      meta: {
        reason: "enrich_error",
        listingTotal: 0,
        mappedProducts: 0,
        matchedProducts: 0,
        detail: err instanceof Error ? err.message : String(err),
        usedListingToken: false,
      },
    };
  }
}
