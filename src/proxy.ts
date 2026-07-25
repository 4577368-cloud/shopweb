import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale, isLocale } from "@/i18n/config";

const PUBLIC_FILE = /\.[^/]+$/; // static assets like /favicon.ico

/**
 * Path prefixes that require an authenticated user (presence of `tb_access` cookie).
 * This is an *optimistic* check — the JWT itself is verified server-side by
 * JwtAuthFilter. The proxy only avoids rendering a protected page for a clearly
 * unauthenticated request.
 *
 * P2.1: business pages are now protected. Public routes: /login, /register,
 * /install (has its own auth check + redirects to /login), /authorize (reached
 * via OAuth redirect, may have a just-issued cookie).
 */
const PROTECTED_PREFIXES = [
  "/account",
  "/catalog",
  "/logistics",
  "/operations-center",
  "/order-center",
  "/products",
  "/sku-align",
  "/sync",
];

/**
 * Paths that are always public even if they look protected. The root workbench
 * "/" is protected separately below.
 */
const PUBLIC_EXACT_PATHS: string[] = [];

/** Whether the stripped (locale-removed) path is the root workbench. */
function isRootWorkbench(stripped: string): boolean {
  return stripped === "/" || stripped === "";
}

function detectLocale(req: NextRequest): string {
  // 1) Explicit choice persisted by the language switcher.
  const cookieLocale = req.cookies.get("locale")?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  // 2) Browser preference.
  const accept = req.headers.get("accept-language");
  if (accept) {
    const preferred = accept
      .split(",")
      .map((part) => part.split(";")[0].trim().slice(0, 2).toLowerCase());
    for (const lang of preferred) {
      if (isLocale(lang)) return lang;
    }
  }
  return defaultLocale;
}

/** Strip the leading locale segment (/zh/account → /account). Returns "/" if none. */
function stripLocale(pathname: string): string {
  const segments = pathname.split("/");
  if (segments.length > 1 && isLocale(segments[1])) {
    return "/" + segments.slice(2).join("/");
  }
  return pathname === "/" ? "/" : pathname;
}

function isProtected(pathname: string): boolean {
  const stripped = stripLocale(pathname);
  if (PUBLIC_EXACT_PATHS.includes(stripped)) return false;
  // Root workbench ("/" after stripping locale) requires login.
  if (isRootWorkbench(stripped)) return true;
  return PROTECTED_PREFIXES.some((prefix) =>
    stripped === prefix || stripped.startsWith(prefix + "/")
  );
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Skip API routes, Next internals, and static files.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Auth gate: protected paths require the access cookie to be present.
  // If missing, redirect to /login with the original path preserved in ?from=.
  if (isProtected(pathname)) {
    const hasAccess = Boolean(req.cookies.get("tb_access")?.value);
    if (!hasAccess) {
      const segments = pathname.split("/");
      const locale = isLocale(segments[1]) ? segments[1] : detectLocale(req);
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = `/${locale}/login`;
      loginUrl.search = `?from=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(loginUrl);
    }
  }

  const segments = pathname.split("/");
  const maybeLocale = segments[1];

  if (isLocale(maybeLocale)) {
    // Already localized — keep locale cookie in sync.
    const res = NextResponse.next();
    if (req.cookies.get("locale")?.value !== maybeLocale) {
      res.cookies.set("locale", maybeLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  }

  // No locale prefix → redirect to the detected/default locale.
  const locale = detectLocale(req);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  const res = NextResponse.redirect(url);
  res.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  // Run on everything except API, Next internals, and files with extensions.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
