import { resolvePortalTokenFromRequest } from "@/lib/auth/portal-token";

/** Resolve Tangbuy portal JWT for server/BFF mall calls (per-request user). */
export function resolveServerMallToken(request?: {
  headers: Headers;
}): string | null {
  if (request) {
    const fromUser = resolvePortalTokenFromRequest(request);
    if (fromUser) return fromUser;
  }
  return null;
}

export function resolveMallGatewayBaseUrl(): string {
  return (
    process.env.TANGBUY_MALL_GATEWAY_BASE_URL ||
    process.env.TANG_PLUGIN_TANGBUY_MALL_GATEWAY_BASE_URL ||
    process.env.NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL ||
    "https://tangbuy.cc"
  ).replace(/\/+$/, "");
}

export function isServerMallGatewayConfigured(request?: {
  headers: Headers;
}): boolean {
  return Boolean(resolveServerMallToken(request));
}
