import type { TranslateFn } from "@/i18n/server";
import { ApiError } from "@/lib/api";
import { isOfferNotFoundMessage } from "@/lib/batch-link/match-errors";

/** Map SKU align / manual bind backend machine codes to readable copy. */
export function mapSkuAlignError(err: unknown, t?: TranslateFn): string {
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
  if (raw.startsWith("NOT_BOUND")) {
    return t?.("skuBinding.errNotBound") ?? "NOT_BOUND";
  }
  if (raw.startsWith("NO_VARIANT")) {
    return t?.("skuBinding.errNoVariant") ?? "NO_VARIANT";
  }
  if (raw.startsWith("NO_OFFER_SKU")) {
    return t?.("skuBinding.errNoOfferSku") ?? "NO_OFFER_SKU";
  }
  if (raw.startsWith("AOP_CRED_MISSING")) {
    return t?.("skuBinding.errAopCred") ?? "AOP_CRED_MISSING";
  }
  if (raw.startsWith("AOP_TOKEN_INVALID")) {
    return t?.("skuBinding.errAopToken") ?? "AOP_TOKEN_INVALID";
  }
  if (isOfferNotFoundMessage(raw)) {
    return t?.("skuBinding.errOfferGone") ?? "OFFER_NOT_FOUND";
  }
  if (raw.startsWith("GATEWAY_BUSY")) {
    return t?.("skuBinding.errGatewayBusy") ?? "GATEWAY_BUSY";
  }
  if (raw.startsWith("SKU_NOT_IN_MATRIX")) {
    return raw.includes(":")
      ? raw.split(":").slice(1).join(":").trim()
      : (t?.("skuBinding.errSkuNotInMatrix") ?? "SKU_NOT_IN_MATRIX");
  }
  if (raw.startsWith("NO_UNRESOLVED_VARIANT")) {
    return t?.("skuBinding.errNoUnresolved") ?? "NO_UNRESOLVED_VARIANT";
  }
  if (raw.startsWith("SUPPLEMENT_LIMIT")) {
    return t?.("skuBinding.errSupplementLimit") ?? "SUPPLEMENT_LIMIT";
  }
  if (raw.startsWith("SUPPLEMENT_SAME_AS_PRIMARY")) {
    return t?.("skuBinding.errSupplementSame") ?? "SUPPLEMENT_SAME_AS_PRIMARY";
  }
  return raw || (t?.("skuBinding.errSaveFailed") ?? "SAVE_FAILED");
}
