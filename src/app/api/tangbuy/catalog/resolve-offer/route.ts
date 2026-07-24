import { NextResponse } from "next/server";
import { isPreferredPoolConfigured } from "@/lib/tangbuy/preferred-pool-config";
import { resolveOfferViaAdminCatalog } from "@/lib/tangbuy/admin-offer-resolve";
import { isOfferId1688 } from "@/lib/catalog-product-resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  offerId1688?: string;
}

export async function POST(request: Request) {
  if (!isPreferredPoolConfigured()) {
    return NextResponse.json(
      { ok: false, error: "未配置 TANGBUY_ADMIN_TOKEN", skipped: true },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const offerId = body.offerId1688?.trim() ?? "";
  if (!isOfferId1688(offerId)) {
    return NextResponse.json(
      { ok: false, error: "缺少有效的 1688 offerId" },
      { status: 400 }
    );
  }

  const match = await resolveOfferViaAdminCatalog(offerId);
  if (!match) {
    return NextResponse.json({
      ok: false,
      status: "not_found",
      error: "Admin 商品库中未找到该 offer",
    });
  }

  return NextResponse.json({
    ok: true,
    ...match,
    catalogItemId: match.internalGoodsId,
  });
}
