import { getPreferredPoolServerConfig } from "@/lib/tangbuy/preferred-pool-config";

const ADMIN_FETCH_TIMEOUT_MS = 28_000;

function pluginAdminProxyBase(): string | null {
  const explicit = process.env.TANGBUY_ADMIN_PROXY_BASE?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const apiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (apiBase) return `${apiBase.replace(/\/$/, "")}/api/plugin/tangbuy-admin`;
  return null;
}

/**
 * Call Tangbuy admin prod-api from Next.js (Vercel). Direct fetch often fails; fall back to
 * the Render plugin proxy when configured.
 */
export async function fetchTangbuyAdmin(
  adminPath: string,
  init: RequestInit & { jsonBody?: unknown }
): Promise<Response> {
  const { baseUrl, token } = getPreferredPoolServerConfig();
  const path = adminPath.startsWith("/") ? adminPath : `/${adminPath}`;
  const url = `${baseUrl}${path}`;

  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", token);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, text/plain, */*");
  if (init.jsonBody !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json;charset=UTF-8");
  }

  const body =
    init.jsonBody !== undefined ? JSON.stringify(init.jsonBody) : init.body;

  const directInit: RequestInit = {
    ...init,
    headers,
    body,
    signal: init.signal ?? AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS),
  };

  try {
    const res = await fetch(url, directInit);
    return res;
  } catch (directErr) {
    const proxyBase = pluginAdminProxyBase();
    if (!proxyBase) throw directErr;

    const proxyUrl = `${proxyBase}${path}`;
    const proxyRes = await fetch(proxyUrl, {
      method: init.method ?? "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        Accept: "application/json, text/plain, */*",
      },
      body: body ?? undefined,
      signal: AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS),
    });
    return proxyRes;
  }
}
