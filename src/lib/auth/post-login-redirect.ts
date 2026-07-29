import { localePath } from "@/i18n/LocaleLink";
import type { Locale } from "@/i18n/config";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

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

/**
 * 登录成功后的默认落点（与营销页 Nav「进入工作台」一致）。
 */
export function resolvePostLoginPath(
  locale: Locale,
  from: string | null | undefined,
  ops: { isAuthorized: boolean }
): string {
  if (from && from.startsWith("/") && !from.startsWith("//") && !isAuthRoutePath(from)) {
    const qIndex = from.indexOf("?");
    const rawPath = qIndex >= 0 ? from.slice(0, qIndex) : from;
    const query = qIndex >= 0 ? from.slice(qIndex) : "";
    const pathOnly = stripLocalePrefix(rawPath);
    // Ignore retired operations-center deep links if bookmarked.
    if (
      pathOnly === "/operations-center" ||
      pathOnly.startsWith("/operations-center/")
    ) {
      // fall through to default workbench target
    } else {
      return `${localePath(locale, pathOnly || "/")}${query}`;
    }
  }

  if (!ops.isAuthorized) return localePath(locale, "/authorize");
  return localePath(locale, "/products");
}
