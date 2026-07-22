import { ApiError } from "@/lib/api";
import { isOfferNotFoundMessage } from "@/lib/batch-link/match-errors";

/** Map SKU align / manual bind backend machine codes to readable copy. */
export function mapSkuAlignError(err: unknown): string {
  let raw = "";
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    const body = err.body as { message?: string } | undefined;
    raw = body?.message ?? err.message;
    const colonIdx = raw.indexOf("：");
    if (colonIdx >= 0 && raw.startsWith("请求失败")) {
      raw = raw.slice(colonIdx + 1).trim();
    }
  } else if (err instanceof Error) {
    raw = err.message;
  }
  if (raw.startsWith("NOT_BOUND")) return "该商品尚未绑定货源，请先在「智能选品」确认匹配";
  if (raw.startsWith("NO_VARIANT")) return "该商品无可用变体，请重新同步商品";
  if (raw.startsWith("NO_OFFER_SKU")) return "该 Tangbuy 货源未返回可用 SKU";
  if (raw.startsWith("AOP_CRED_MISSING")) return "1688 开放平台凭证未配置，请联系管理员";
  if (raw.startsWith("AOP_TOKEN_INVALID")) return "1688 授权已失效，请联系管理员";
  if (isOfferNotFoundMessage(raw)) return "该货源已下架或无效，请换一个候选";
  if (raw.startsWith("GATEWAY_BUSY")) return "货源校验服务暂不可用，请稍后重试";
  if (raw.startsWith("SKU_NOT_IN_MATRIX")) {
    return raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : "所选 SKU 不在货源规格表中";
  }
  if (raw.startsWith("NO_UNRESOLVED_VARIANT")) return "当前没有需要补充货源的变体";
  if (raw.startsWith("SUPPLEMENT_LIMIT")) return "V1 每个商品仅支持 1 个补充货源";
  if (raw.startsWith("SUPPLEMENT_SAME_AS_PRIMARY")) return "补充货源不能与主货源相同";
  return raw || "保存绑定失败";
}
