import { NextResponse } from "next/server";
import { rejectUnlessAppSession } from "@/lib/auth/require-app-session";
import {
  chatCompletionJson,
  LlmUnavailableError,
} from "@/lib/agents/llm/openai-compatible";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set([
  "fixed_kit_title",
  "mix_title",
  "byob_title",
  "byob_slot",
  "gift_label",
  "combo_label",
]);

type NameKind =
  | "fixed_kit_title"
  | "mix_title"
  | "byob_title"
  | "byob_slot"
  | "gift_label"
  | "combo_label";

/**
 * POST /api/agents/bundle/name
 * Body: { kind, locale?, context }
 * Returns: { name }
 */
export async function POST(request: Request) {
  const denied = rejectUnlessAppSession(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体需为 JSON" }, { status: 400 });
  }

  const kind = (body as { kind?: unknown }).kind;
  const localeRaw = (body as { locale?: unknown }).locale;
  const context = (body as { context?: unknown }).context;

  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return NextResponse.json({ error: "无效 kind" }, { status: 400 });
  }
  if (!context || typeof context !== "object") {
    return NextResponse.json({ error: "无效 context" }, { status: 400 });
  }

  const locale =
    typeof localeRaw === "string" && localeRaw.trim()
      ? localeRaw.trim()
      : "zh";

  try {
    const name = await generateBundleName(kind as NameKind, locale, context as Record<string, unknown>);
    return NextResponse.json({ name });
  } catch (err) {
    const msg =
      err instanceof LlmUnavailableError
        ? err.message
        : err instanceof Error
          ? err.message
          : "命名失败";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}

async function generateBundleName(
  kind: NameKind,
  locale: string,
  context: Record<string, unknown>
): Promise<string> {
  const lang = locale.startsWith("zh")
    ? "简体中文"
    : locale.startsWith("es")
      ? "español"
      : locale.startsWith("fr")
        ? "français"
        : "English";

  const system = [
    "You are a senior DTC merchandising copywriter for Shopify stores.",
    "Write ONE short customer-facing or ops-facing name for a bundle / promo field.",
    "Rules:",
    "- Output ONLY the name text. No quotes, no markdown, no explanation.",
    `- Language: ${lang}.`,
    "- Prefer 6–28 characters for CJK, or 3–8 words for Latin scripts.",
    "- Sound premium and clear; avoid spammy ALL CAPS, emoji, and fake urgency.",
    "- Do not invent brand names that are not in the context.",
    "- If context is thin, still produce a usable generic name for that play type.",
  ].join("\n");

  const user = buildUserPrompt(kind, context);

  const raw = await chatCompletionJson({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.55,
    timeoutMs: 18_000,
  });

  const cleaned = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  if (!cleaned) throw new LlmUnavailableError("LLM 返回空名称");
  return cleaned;
}

function buildUserPrompt(kind: NameKind, ctx: Record<string, unknown>): string {
  const components = asStringList(ctx.componentTitles ?? ctx.productTitles);
  const pool = asStringList(ctx.poolTitles);
  const trigger = asString(ctx.triggerTitle ?? ctx.productTitle);
  const gift = asString(ctx.giftTitle);
  const role = asString(ctx.slotRole);
  const minQty = ctx.minQty;
  const pricing = asString(ctx.pricingType);
  const percent = ctx.percent;
  const amount = asString(ctx.fixedAmount);

  switch (kind) {
    case "fixed_kit_title":
      return [
        "Field: Shopify fixed-kit parent product title (shopper-facing).",
        "Goal: make the kit feel like a complete offer, not a raw SKU dump.",
        components.length
          ? `Components: ${components.slice(0, 8).join(" · ")}`
          : "Components: (not provided)",
        trigger ? `Seed / hero product: ${trigger}` : "",
        "Examples of tone: 「旅行洗护套装」「亲肤三件套礼盒」— not 「商品A+商品B」.",
      ]
        .filter(Boolean)
        .join("\n");

    case "mix_title":
      return [
        "Field: Mix & match campaign title (merchant list + optional storefront label).",
        "Goal: communicate ‘pick any N from the pool’ with the deal shape.",
        minQty != null ? `Min quantity: ${String(minQty)}` : "",
        pricing === "fixed_price"
          ? `Pricing: flat price ${amount || "(amount TBD)"}`
          : `Pricing: percent off ${percent != null ? String(percent) + "%" : "(TBD)"}`,
        pool.length ? `Pool samples: ${pool.slice(0, 8).join(" · ")}` : "",
        "Examples: 「任选3件99」「配饰满2件85折」.",
      ]
        .filter(Boolean)
        .join("\n");

    case "byob_title":
      return [
        "Field: Build-your-own box campaign title.",
        "Goal: invite shoppers to customize a gift / set.",
        pool.length ? `Products involved: ${pool.slice(0, 8).join(" · ")}` : "",
        "Examples: 「自选礼盒」「DIY 护肤体验盒」.",
      ]
        .filter(Boolean)
        .join("\n");

    case "byob_slot":
      return [
        "Field: Customer-facing BYOB slot name.",
        `Slot role hint: ${role || "other"}`,
        pool.length ? `Products in this slot: ${pool.slice(0, 6).join(" · ")}` : "",
        "Examples by role: 主品→「选择杯身」; 配件→「加购贴纸」; 赠品→「附赠小样（任选）」.",
        "Keep it action-oriented and short.",
      ]
        .filter(Boolean)
        .join("\n");

    case "gift_label":
      return [
        "Field: Free-gift offer headline on the product page.",
        trigger ? `Trigger product: ${trigger}` : "",
        gift ? `Gift product: ${gift}` : "",
        minQty != null ? `Unlock at qty: ${String(minQty)}` : "",
        "Examples: 「满2件赠旅行装」「下单即送滤纸」.",
      ]
        .filter(Boolean)
        .join("\n");

    case "combo_label":
      return [
        "Field: Same-product combo / qty-discount display label.",
        trigger ? `Product: ${trigger}` : "",
        minQty != null ? `Qty threshold: ${String(minQty)}` : "",
        percent != null ? `Discount: ${String(percent)}%` : "",
        "Examples: 「买2件减10%」「两件套更划算」.",
      ]
        .filter(Boolean)
        .join("\n");

    default:
      return "Write a short promo name.";
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}
