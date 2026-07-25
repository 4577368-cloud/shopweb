/** 客户经理入口场景 — 每页文案不同，链接可扩展为多名经理。 */
export type AccountManagerContext = "products" | "sku" | "logistics";

export interface AccountManagerContact {
  id: string;
  displayName: string;
  whatsappUrl: string;
  avatarUrl: string;
}

const DEFAULT_AVATAR = "/brand/account-manager-avatar.png";

function resolveWhatsAppBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ACCOUNT_MANAGER_WHATSAPP_URL?.trim();
  if (fromEnv) return fromEnv;
  return "https://wa.me/";
}

/** 暂用单一经理；后续可改为列表 + 轮询/按店铺分配。 */
export function listAccountManagers(): AccountManagerContact[] {
  return [
    {
      id: "default",
      displayName: "Account Manager",
      whatsappUrl: resolveWhatsAppBase(),
      avatarUrl: DEFAULT_AVATAR,
    },
  ];
}

export function primaryAccountManager(): AccountManagerContact {
  return listAccountManagers()[0];
}

export function accountManagerWhatsAppHref(
  context: AccountManagerContext,
  manager: AccountManagerContact = primaryAccountManager(),
): string {
  const base = manager.whatsappUrl;
  if (!base || base === "https://wa.me/") return base;
  const sep = base.includes("?") ? "&" : "?";
  const text = encodeURIComponent(defaultPrefillMessage(context));
  if (base.includes("text=")) return base;
  return `${base}${sep}text=${text}`;
}

function defaultPrefillMessage(context: AccountManagerContext): string {
  switch (context) {
    case "products":
      return "你好，我想请客户经理协助批量议价与沟通定制。";
    case "sku":
      return "你好，我想交给客户经理做精准商品与 SKU 关联。";
    case "logistics":
      return "你好，我想锁定超时必赔的物流线路与时效。";
    default:
      return "你好，我需要客户经理协助。";
  }
}

export const ACCOUNT_MANAGER_CTA_I18N: Record<AccountManagerContext, string> = {
  products: "accountManager.cta.products",
  sku: "accountManager.cta.sku",
  logistics: "accountManager.cta.logistics",
};
