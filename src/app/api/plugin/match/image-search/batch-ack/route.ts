import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

export async function POST(request: Request) {
  let body: { shopName: string; thirdPlatformItemIds: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const { shopName, thirdPlatformItemIds } = body;

  if (!shopName || !Array.isArray(thirdPlatformItemIds)) {
    return NextResponse.json(
      { error: "缺少必要参数：shopName, thirdPlatformItemIds" },
      { status: 400 }
    );
  }

  if (thirdPlatformItemIds.length === 0) {
    return NextResponse.json({ success: true, ok: 0, failed: [] });
  }

  if (!API_BASE) {
    return NextResponse.json({
      success: true,
      ok: thirdPlatformItemIds.length,
      failed: [],
    });
  }

  const ok: string[] = [];
  const failed: string[] = [];

  const ackUrl = `${API_BASE}/api/plugin/match/image-search/ack`;

  for (const id of thirdPlatformItemIds) {
    try {
      const params = new URLSearchParams({ shopName, thirdPlatformItemId: id });
      const res = await fetch(`${ackUrl}?${params.toString()}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      if (res.ok) {
        ok.push(id);
      } else {
        failed.push(id);
      }
    } catch {
      failed.push(id);
    }
  }

  return NextResponse.json({
    success: failed.length === 0,
    ok: ok.length,
    failed,
  });
}