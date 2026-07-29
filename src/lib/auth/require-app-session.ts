import { NextResponse } from "next/server";

/**
 * Soft session check for same-origin Next BFF routes (`/api/agents`, `/api/translate`, …).
 *
 * Accepts either:
 * - Standalone httpOnly `tb_access` cookie, or
 * - Embedded `Authorization: Bearer <plugin JWT>` from session-token exchange.
 *
 * Does not cryptographically verify the JWT here (plugin does on `/api/plugin/**`).
 * Presence of a credential is enough to stop anonymous internet abuse of LLM/OSS/admin spend.
 */

export function hasAppSessionCredential(request: Request): boolean {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (/^bearer\s+\S{8,}$/i.test(authorization)) return true;

  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)tb_access=([^;]*)/.exec(cookie);
  return Boolean(match?.[1]?.trim());
}

export function unauthorizedAppSessionResponse(
  message = "Unauthorized"
): NextResponse {
  return NextResponse.json(
    { error: message, code: "UNAUTHENTICATED" },
    { status: 401 }
  );
}

/** Return a 401 response when credentials are missing; otherwise null. */
export function rejectUnlessAppSession(request: Request): NextResponse | null {
  if (hasAppSessionCredential(request)) return null;
  return unauthorizedAppSessionResponse();
}
