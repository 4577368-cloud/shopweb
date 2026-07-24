import { NextResponse } from "next/server";
import {
  getPreferredPoolServerConfig,
  isPreferredPoolConfigured,
  isPreferredPoolDuplicateMessage,
  isPreferredPoolUpstreamSuccess,
} from "@/lib/tangbuy/preferred-pool-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PoolAddBody {
  providerItemId?: string;
  providerType?: string;
}

export async function POST(request: Request) {
  if (!isPreferredPoolConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "未配置 TANGBUY_ADMIN_TOKEN，无法登记商品库",
        skipped: true,
      },
      { status: 503 }
    );
  }

  let body: PoolAddBody;
  try {
    body = (await request.json()) as PoolAddBody;
  } catch {
    return NextResponse.json({ ok: false, error: "无效 JSON" }, { status: 400 });
  }

  const providerItemId = body.providerItemId?.trim();
  if (!providerItemId) {
    return NextResponse.json(
      { ok: false, error: "缺少 providerItemId（1688 offerId）" },
      { status: 400 }
    );
  }

  const { baseUrl, token, defaults } = getPreferredPoolServerConfig();

  // categoryId 非 OpenAPI 必填项 — 默认不传，由 admin 根据 1688 商品信息自动映射类目。
  // 仅当显式配置 TANGBUY_POOL_CATEGORY_ID 时才覆盖传入。
  const payload: Record<string, unknown> = {
    providerItemId,
    providerType: body.providerType?.trim() || defaults.providerType,
    saveSource: defaults.saveSource,
    level: defaults.level,
    suitableCountryList: defaults.suitableCountryList,
    labelIdList: defaults.labelIdList,
    operateUserId: defaults.operateUserId || undefined,
    operateUserName: defaults.operateUserName,
    operateDept: defaults.operateDept || undefined,
    ownerSource: defaults.ownerSource,
  };
  if (defaults.categoryId) {
    payload.categoryId = defaults.categoryId;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/product-mall/admin/preferred/pool/add`, {
      method: "POST",
      headers: {
        Authorization: token,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json;charset=UTF-8",
        Referer: "https://admin.tangbuy.cc/goods/shop/pool",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: `商品库登记网关不可达：${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 502 }
    );
  }

  const text = await upstream.text();
  let parsed: { code?: number; msg?: string } | undefined;
  try {
    parsed = text ? (JSON.parse(text) as { code?: number; msg?: string }) : undefined;
  } catch {
    parsed = undefined;
  }

  const msg = parsed?.msg ?? text ?? "";
  const code = parsed?.code;

  if (isPreferredPoolDuplicateMessage(msg)) {
    return NextResponse.json({
      ok: true,
      status: "already_exists",
      msg: msg || "已在商品库",
      code,
    });
  }

  if (isPreferredPoolUpstreamSuccess(upstream.ok, code, msg)) {
    return NextResponse.json({
      ok: true,
      status: "submitted",
      msg: msg || "成功",
      code,
    });
  }

  const isAuthFailure =
    code === 401 ||
    msg.includes("认证失败") ||
    msg.toLowerCase().includes("unauthorized");

  return NextResponse.json(
    {
      ok: false,
      error: isAuthFailure
        ? "TANGBUY_ADMIN_TOKEN 无效或已过期，请从 admin.tangbuy.cc 重新复制 Bearer token"
        : msg || `商品库登记失败（${upstream.status}）`,
      upstreamStatus: upstream.status,
      code,
      upstreamBody: parsed ? undefined : text.slice(0, 500) || undefined,
    },
    { status: isAuthFailure ? 401 : 502 }
  );
}
