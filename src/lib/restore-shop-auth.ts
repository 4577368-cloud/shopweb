import { api } from "@/lib/api";
import { SHOP_STORAGE_KEY } from "@/lib/shopify-install";

export interface RestoredShopAuth {
  name: string;
  domain: string;
  authorizedAt: string;
  productCount: number;
}

function fmtAuthorizedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("zh-CN", { hour12: false });
}

/** Resolve which shop domain to probe on cold load (localStorage → URL → first authorized shop). */
export async function resolveShopDomainToRestore(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const shopFromUrl = new URLSearchParams(window.location.search).get("shop");
  const stored = window.localStorage.getItem(SHOP_STORAGE_KEY);
  let shopToRestore = stored ?? shopFromUrl;

  if (shopFromUrl && !stored) {
    window.localStorage.setItem(SHOP_STORAGE_KEY, shopFromUrl);
  }

  if (shopToRestore) {
    return shopToRestore;
  }

  try {
    const list = await api.listAuthorizedShops();
    const first = Array.isArray(list) ? list[0] : undefined;
    if (first?.shopDomain) {
      window.localStorage.setItem(SHOP_STORAGE_KEY, first.shopDomain);
      return first.shopDomain;
    }
  } catch {
    // Offline / backend unavailable — fall through.
  }

  return null;
}

/** Ask backend whether a remembered shop is still authorized. */
export async function fetchRestoredShopAuth(
  shopDomain: string
): Promise<RestoredShopAuth | null> {
  const status = await api.getShopStatus(shopDomain);
  if (!status.authorized) return null;

  const domain = status.shopDomain ?? shopDomain;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SHOP_STORAGE_KEY, domain);
  }

  return {
    name: status.shopName ?? shopDomain.split(".")[0] ?? shopDomain,
    domain,
    authorizedAt: fmtAuthorizedAt(status.authorizedAt),
    productCount: status.productCount ?? 0,
  };
}
