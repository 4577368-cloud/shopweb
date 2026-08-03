import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

export async function POST(request: Request) {
  if (!API_BASE) {
    return NextResponse.json(
      { code: "API_BASE_MISSING", message: "NEXT_PUBLIC_API_BASE is not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const upstream = await fetch(
    `${API_BASE}/api/plugin/shopify/auth/session-token`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": request.headers.get("content-type") ?? "application/json",
      },
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
