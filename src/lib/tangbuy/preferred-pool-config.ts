/** Server-only defaults for Tangbuy admin preferred pool ingest. */
export function getPreferredPoolServerConfig() {
  const base =
    process.env.TANGBUY_ADMIN_API_BASE?.trim() ||
    "https://admin.tangbuy.cc/prod-api";

  let token = process.env.TANGBUY_ADMIN_TOKEN?.trim() ?? "";
  // Guard against malformed .env lines that concatenate the next KEY=value onto the token.
  const corruptIdx = token.search(/TANGBUY_/i);
  if (corruptIdx > 0) {
    token = token.slice(0, corruptIdx).trim();
  }
  if (token && !token.toLowerCase().startsWith("bearer ")) {
    token = `Bearer ${token}`;
  }

  const categoryRaw = process.env.TANGBUY_POOL_CATEGORY_ID?.trim();
  const categoryId = categoryRaw ? Number(categoryRaw) : 0;

  let suitableCountryList: string[] = [];
  const countriesRaw = process.env.TANGBUY_POOL_DEFAULT_COUNTRIES?.trim();
  if (countriesRaw) {
    try {
      const parsed = JSON.parse(countriesRaw) as unknown;
      if (Array.isArray(parsed)) {
        suitableCountryList = parsed.filter((c): c is string => typeof c === "string");
      }
    } catch {
      suitableCountryList = countriesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  const operateUserId = Number(process.env.TANGBUY_POOL_OPERATE_USER_ID ?? "0") || 0;
  const operateDept = process.env.TANGBUY_POOL_OPERATE_DEPT?.trim() ?? "";

  return {
    baseUrl: base.replace(/\/$/, ""),
    token,
    defaults: {
      providerType: "alibaba" as const,
      saveSource: "LINK" as const,
      level: (process.env.TANGBUY_POOL_DEFAULT_LEVEL?.trim() || "S") as string,
      categoryId: Number.isFinite(categoryId) ? categoryId : 0,
      suitableCountryList,
      labelIdList: [] as number[],
      operateUserId,
      operateUserName: process.env.TANGBUY_POOL_OPERATE_USER_NAME?.trim() || "admin",
      operateDept,
      ownerSource: "OPERATE" as const,
    },
  };
}

export function isPreferredPoolConfigured(): boolean {
  return Boolean(getPreferredPoolServerConfig().token);
}

/** Treat duplicate / already-in-pool responses as success — repeat add is expected. */
export function isPreferredPoolDuplicateMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("已存在") ||
    m.includes("已在") ||
    m.includes("重复") ||
    m.includes("商品池") && m.includes("存在") ||
    m.includes("already") ||
    m.includes("exist") ||
    m.includes("duplicate")
  );
}

/** Any pool-add outcome that means the offer is (or will be) in catalog — proceed. */
export function isPreferredPoolPassThrough(msg: string, code?: number): boolean {
  if (isPreferredPoolDuplicateMessage(msg)) return true;
  return code === 200 || code === undefined;
}
