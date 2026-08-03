import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

function cookieValue(cookie: string | null, name: string): string | null {
  if (!cookie) return null;
  const prefix = `${name}=`;
  return (
    cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function isShopifySessionToken(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const issuer = typeof payload.iss === "string" ? payload.iss : "";
  return Boolean(payload.dest) || issuer.includes(".myshopify.com/admin");
}

export async function POST(request: Request) {
  if (!API_BASE) {
    return NextResponse.json(
      { code: "API_BASE_MISSING", message: "NEXT_PUBLIC_API_BASE is not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": request.headers.get("content-type") ?? "application/json",
  };
  const cookie = request.headers.get("cookie");
  const cookieToken = cookieValue(cookie, "TANGBUY_TOKEN") ?? cookieValue(cookie, "tb_access");
  const authToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const tangbuyToken =
    cookieToken || (authToken && !isShopifySessionToken(authToken) ? authToken : null);
  if (tangbuyToken) headers["X-Tangbuy-Token"] = tangbuyToken;

  const upstream = await fetch(
    `${API_BASE}/api/plugin/shopify/auth/session-token`,
    {
      method: "POST",
      headers,
      body,
      redirect: "manual",
    }
  );

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
