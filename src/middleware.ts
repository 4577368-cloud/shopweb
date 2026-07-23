import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale, isLocale } from "@/i18n/config";

const PUBLIC_FILE = /\.[^/]+$/; // static assets like /favicon.ico

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

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Skip API routes, Next internals, and static files.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
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
