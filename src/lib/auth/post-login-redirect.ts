import { localePath } from "@/i18n/LocaleLink";
import type { Locale } from "@/i18n/config";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

/** 运营中枢路由：未解锁前不应作为登录回跳目标。 */
const HUB_ROUTE_PREFIXES = ["/operations-center", "/order-center"];

/** Strip leading `/zh` (or any locale) so `localePath` does not double-prefix. */
export function stripLocalePrefix(path: string): string {
  const pathOnly = path.split("?")[0] ?? path;
  const segments = pathOnly.split("/").filter(Boolean);
  if (segments.length >= 1 && /^[a-z]{2}$/i.test(segments[0]!)) {
    const rest = "/" + segments.slice(1).join("/");
    return rest === "/" ? "/" : rest;
  }
  return pathOnly || "/";
}

/** 登录/注册页路径（含 locale 前缀），不应作为 ?from= 回跳目标。 */
export function isAuthRoutePath(path: string): boolean {
  const rest = stripLocalePrefix(path);
  if (rest === "" || rest === "/") return false;
  return AUTH_ROUTES.some((r) => rest === r || rest.startsWith(`${r}/`));
}

export function isHubRoutePath(path: string): boolean {
  const rest = stripLocalePrefix(path);
  return HUB_ROUTE_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
}

/**
 * 登录成功后的默认落点（与营销页 Nav「进入工作台」一致）。
 *
 * `?from=` 仅在「用户本就该去那里」时生效：
 * - 鉴权页 / 外链无效路径 → 忽略
 * - 运营中枢（订单中心 / 运营中心）→ 仅当已绑店且中枢已解锁，否则回授权或选品
 */
export function resolvePostLoginPath(
  locale: Locale,
  from: string | null | undefined,
  ops: { isAuthorized: boolean; operationsHubReady: boolean }
): string {
  if (from && from.startsWith("/") && !from.startsWith("//") && !isAuthRoutePath(from)) {
    const qIndex = from.indexOf("?");
    const rawPath = qIndex >= 0 ? from.slice(0, qIndex) : from;
    const query = qIndex >= 0 ? from.slice(qIndex) : "";
    const pathOnly = stripLocalePrefix(rawPath);

    const hubDeepLink = isHubRoutePath(pathOnly);
    const hubAllowed = ops.isAuthorized && ops.operationsHubReady;

    if (!hubDeepLink || hubAllowed) {
      return `${localePath(locale, pathOnly || "/")}${query}`;
    }
    // Stale ?from=/operations-center after cookie bounce — do not yank early users into hub.
  }

  if (!ops.isAuthorized) return localePath(locale, "/authorize");
  // Hub is opt-in via sidebar — never auto-land on order/ops center after login.
  return localePath(locale, "/products");
}
