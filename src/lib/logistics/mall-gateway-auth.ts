/** Server-side Tangbuy mall gateway credentials (estimate / itemGet). */
export function resolveServerMallToken(): string | null {
  return (
    process.env.TANG_PLUGIN_TANGBUY_MALL_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_TANGBUY_MALL_TOKEN?.trim() ||
    null
  );
}

export function resolveMallGatewayBaseUrl(): string {
  return (
    process.env.TANG_PLUGIN_TANGBUY_MALL_GATEWAY_BASE_URL ||
    process.env.NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL ||
    "https://tangbuy.cc"
  ).replace(/\/+$/, "");
}

export function isServerMallGatewayConfigured(): boolean {
  return Boolean(resolveServerMallToken());
}
