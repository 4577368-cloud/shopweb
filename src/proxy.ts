import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale, isLocale } from "@/i18n/config";

const PUBLIC_FILE = /\.[^/]+$/; // static assets like /favicon.ico

/**
 * Path prefixes that require an authenticated user (presence of `tb_access` cookie).
 * Root locale home (`/`, `/zh`, …) is the public marketing landing — not listed here.
 */
const PROTECTED_PREFIXES = [
  "/account",
  "/catalog",
  "/logistics",
  "/order-center",
  "/products",
  "/sku-align",
  "/sync",
  "/upgrade",
];

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
  if (stripped === "/" || stripped === "") return false;
  return PROTECTED_PREFIXES.some((prefix) =>
    stripped === prefix || stripped.startsWith(prefix + "/")
  );
}

/**
 * Embedded Admin often strips ?host=&embedded=1 on left-nav clicks.
 * Cookie auth cannot be relied on inside Safari iframes (ITP), so detect the
 * iframe / Admin parent instead of bouncing to /login (which flashes in a loop
 * once session-token auth succeeds and sends the merchant back).
 */
function isEmbeddedRequest(req: NextRequest): boolean {
  const host = req.nextUrl.searchParams.get("host")?.trim();
  const embeddedFlag = req.nextUrl.searchParams.get("embedded");
  if (host || embeddedFlag === "1" || embeddedFlag === "true") return true;

  if (req.headers.get("sec-fetch-dest") === "iframe") return true;

  const referer = req.headers.get("referer") || "";
  if (/admin\.shopify\.com/i.test(referer)) return true;

  // Same-origin hop inside the Admin iframe (Referer is ai.tangbuy.com/…).
  try {
    if (referer) {
      const ref = new URL(referer);
      const here = req.nextUrl;
      if (ref.origin === here.origin && /[?&](host|embedded)=/i.test(ref.search)) {
        return true;
      }
    }
  } catch {
    /* ignore bad referer */
  }

  return false;
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

  // Auth gate: standalone requires tb_access cookie.
  // Embedded Admin uses session-token Bearer (no cookie) — never bounce to /login.
  if (isProtected(pathname)) {
    const hasAccess = Boolean(req.cookies.get("tb_access")?.value);
    if (!hasAccess && !isEmbeddedRequest(req)) {
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
  const isEmbedded = isEmbeddedRequest(req);

  // Embedded must never see Tangbuy email/password forms — silent shop session only.
  if (isEmbedded && isLocale(maybeLocale)) {
    const stripped = "/" + segments.slice(2).join("/");
    if (
      stripped === "/login" ||
      stripped === "/register" ||
      stripped === "/forgot-password" ||
      stripped === "/reset-password" ||
      stripped.startsWith("/login/") ||
      stripped.startsWith("/register/")
    ) {
      const workbench = req.nextUrl.clone();
      workbench.pathname = `/${maybeLocale}/authorize`;
      return NextResponse.redirect(workbench);
    }
  }

  if (isLocale(maybeLocale)) {
    const stripped = "/" + segments.slice(2).join("/");
    const homeLike = stripped === "/" || stripped === "";
    if (isEmbedded && homeLike) {
      const installUrl = req.nextUrl.clone();
      installUrl.pathname = `/${maybeLocale}/install`;
      const res = NextResponse.redirect(installUrl);
      res.headers.set(
        "Content-Security-Policy",
        "frame-ancestors https://admin.shopify.com https://*.myshopify.com https://*.shopify.com;"
      );
      if (req.cookies.get("locale")?.value !== maybeLocale) {
        res.cookies.set("locale", maybeLocale, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
      }
      return res;
    }

    const res = NextResponse.next();
    res.headers.set(
      "Content-Security-Policy",
      "frame-ancestors https://admin.shopify.com https://*.myshopify.com https://*.shopify.com;"
    );
    if (req.cookies.get("locale")?.value !== maybeLocale) {
      res.cookies.set("locale", maybeLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  }

  // No locale prefix → redirect to the detected/default locale (install when embedded).
  const locale = detectLocale(req);
  const url = req.nextUrl.clone();
  if (isEmbedded && (pathname === "/" || pathname === "")) {
    url.pathname = `/${locale}/install`;
  } else {
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  }
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
