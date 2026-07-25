import { localePath } from "@/i18n/LocaleLink";
import type { Locale } from "@/i18n/config";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

/** 登录/注册页路径（含 locale 前缀），不应作为 ?from= 回跳目标。 */
export function isAuthRoutePath(path: string): boolean {
  const pathOnly = path.split("?")[0] ?? path;
  const segments = pathOnly.split("/").filter(Boolean);
  const rest =
    segments.length >= 1 && /^[a-z]{2}$/i.test(segments[0]!)
      ? "/" + segments.slice(1).join("/")
      : pathOnly;
  if (rest === "" || rest === "/") return false;
  return AUTH_ROUTES.some((r) => rest === r || rest.startsWith(`${r}/`));
}

/** 登录成功后的默认落点（与营销页 Nav「进入工作台」一致）。 */
export function resolvePostLoginPath(
  locale: Locale,
  from: string | null | undefined,
  ops: { isAuthorized: boolean; operationsHubReady: boolean }
): string {
  if (from && from.startsWith("/") && !isAuthRoutePath(from)) {
    return from;
  }
  if (!ops.isAuthorized) return localePath(locale, "/authorize");
  if (ops.operationsHubReady) return localePath(locale, "/order-center");
  return localePath(locale, "/products");
}
