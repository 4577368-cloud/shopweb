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

export async function GET(request: Request) {
  if (!API_BASE) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_API_BASE is not configured" },
      { status: 500 }
    );
  }

  const incoming = new URL(request.url);
  const shop = incoming.searchParams.get("shop")?.trim();
  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  const embedded = incoming.searchParams.get("embedded") === "true";
  const q = new URLSearchParams({ shop });
  const host = incoming.searchParams.get("host")?.trim();
  if (embedded && host) q.set("host", host);

  const path = embedded
    ? `/api/plugin/shopify/auth/install-embedded?${q.toString()}`
    : `/api/plugin/shopify/auth/install?${q.toString()}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  const authorization = request.headers.get("authorization");
  if (authorization?.trim()) {
    headers.Authorization = authorization;
  } else {
    const token = cookieValue(request.headers.get("cookie"), "TANGBUY_TOKEN");
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const upstream = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers,
    redirect: "manual",
  });

  const location = upstream.headers.get("location");
  if (location && upstream.status >= 300 && upstream.status < 400) {
    return NextResponse.json({ url: location });
  }

  const text = await upstream.text();
  return new NextResponse(text || "Unable to create Shopify install URL", {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
    },
  });
}
