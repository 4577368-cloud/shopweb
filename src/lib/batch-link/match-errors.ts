import { ApiError } from "@/lib/api";

/** Strip Next.js proxy wrapper and return backend machine-code message. */
export function extractBackendErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    const body = err.body as { message?: string } | undefined;
    let raw = body?.message ?? err.message;
    const colonIdx = raw.indexOf("：");
    if (colonIdx >= 0 && raw.startsWith("请求失败")) {
      raw = raw.slice(colonIdx + 1).trim();
    }
    return raw;
  }
  if (err instanceof Error) return err.message;
  return "";
}

export function isOfferNotFoundMessage(raw: string): boolean {
  return raw.startsWith("OFFER_NOT_FOUND") || raw.includes("商品不存在");
}

/** True when 1688 offer is delisted / invalid — not a transient gateway issue. */
export function isOfferNotFoundError(err: unknown): boolean {
  return isOfferNotFoundMessage(extractBackendErrorMessage(err));
}

/** True gateway busy / rate limit — excludes delisted-offer false positives. */
export function isGatewayBusyError(err: unknown): boolean {
  const raw = extractBackendErrorMessage(err);
  if (!raw.startsWith("GATEWAY_BUSY")) return false;
  return !isOfferNotFoundMessage(raw);
}

export function mapImageMatchConfirmError(
  err: unknown,
  fallback = "确认匹配失败"
): string {
  const raw = extractBackendErrorMessage(err);
  if (!raw) return fallback;
  if (raw.startsWith("PRODUCT_NOT_FOUND")) {
    return "未找到该商品镜像，请先同步商品";
  }
  if (raw.startsWith("NO_VARIANT")) {
    return "该商品无可用变体（SKU），请重新同步商品后再匹配";
  }
  if (raw.startsWith("SKU_NOT_IN_MATRIX")) {
    return raw.includes(":")
      ? raw.split(":").slice(1).join(":").trim()
      : "所选 SKU 不在货源规格表中";
  }
  if (isOfferNotFoundMessage(raw)) {
    return "该货源已下架或无效，请换一个候选";
  }
  if (raw.startsWith("GATEWAY_BUSY")) {
    return "货源网关繁忙，请稍后重试";
  }
  if (raw.startsWith("AOP_CRED_MISSING") || raw.startsWith("AK_MISSING")) {
    return "货源平台凭证未配置或无效，请配置后重试";
  }
  if (raw.startsWith("AOP_TOKEN_INVALID")) {
    return "货源授权已失效，请重新授权后重试";
  }
  return raw;
}

export function mapImageSearchError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 502 || err.status === 503 || err.status === 504) {
      return "后端服务暂时不可用（可能正在启动），请稍后重试";
    }
  }
  const raw = extractBackendErrorMessage(err);
  if (!raw) return "图搜失败";
  if (raw.startsWith("AOP_CRED_MISSING") || raw.startsWith("AK_MISSING")) {
    return "Tangbuy 货源平台凭证未配置或无效，请配置后重试";
  }
  if (raw.startsWith("AOP_TOKEN_INVALID")) {
    return "Tangbuy 货源授权已失效或过期，请重新授权后重试";
  }
  if (raw.startsWith("IMAGE_UNREADABLE")) {
    return "商品主图无法读取或上传，请更换主图后重试";
  }
  if (raw.startsWith("NO_PRIMARY_IMAGE")) {
    return "该商品无主图，无法进行 Tangbuy 图搜";
  }
  if (raw.startsWith("PRODUCT_NOT_FOUND")) {
    return "未找到该商品镜像，请先同步商品";
  }
  if (isOfferNotFoundMessage(raw)) {
    return "图搜命中货源已下架或无效";
  }
  if (raw.startsWith("GATEWAY_BUSY")) {
    return "Tangbuy 货源网关繁忙或限流，请稍后重试";
  }
  return raw || "图搜失败";
}
