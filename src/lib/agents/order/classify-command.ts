// 订单指令「确定性规则」分类器（Phase 6）。
// 不调用 LLM：用关键词（中英）把自然语言映射到 OrderCommandDraft。
// 所有可落地指令都对应真实列表操作，故分类结果可预测、零成本。
import type { OrderSummary } from "@/lib/order/types";
import type {
  OrderCommandClassifyResult,
  OrderCommandDraft,
  OrderCommandId,
  OrderTabKey,
  OrderCommandClarifyCandidate,
} from "./command-schema";
import { buildOrderDraftFromIntent } from "./command-schema";

export interface OrderClassifyContext {
  t: (key: string, params?: Record<string, string | number>) => string;
  orders: OrderSummary[];
}

// 状态关键词（zh + en，小写比对）
const STATUS_KEYWORDS: { tab: Exclude<OrderTabKey, "all">; keys: string[] }[] = [
  { tab: "pendingOrder", keys: ["待下单", "待采购", "pending order", "pendingorder"] },
  { tab: "pendingSupplement", keys: ["待补款", "pending supplement"] },
  { tab: "pendingPayment", keys: ["待支付", "待付款", "pending payment"] },
  { tab: "preparing", keys: ["备货中", "preparing"] },
  { tab: "pendingShipment", keys: ["待发货", "pending shipment"] },
  { tab: "inTransit", keys: ["运输中", "在途", "in transit", "intransit"] },
  { tab: "delivered", keys: ["已送达", "已签收", "delivered"] },
  { tab: "canceled", keys: ["已取消", "canceled", "cancelled"] },
];

const ALL_KEYWORDS = ["全部", "所有订单", "所有", "all orders", "all"];

function matchStatus(lower: string): OrderTabKey | null {
  for (const s of STATUS_KEYWORDS) {
    if (s.keys.some((k) => lower.includes(k))) return s.tab;
  }
  if (ALL_KEYWORDS.some((k) => lower.includes(k))) return "all";
  return null;
}

function extractOrderFragment(text: string): string | null {
  const m = text.match(/#?\d{3,}/);
  return m ? m[0].replace(/^#/, "") : null;
}

// 去掉搜索类引导词，保留实质查询串
function stripSearchVerb(text: string): string {
  return text
    .replace(/(搜索|查找|查询|search|find|找|包含|含)\s*[:：]?/gi, "")
    .trim();
}

function clarifyCandidates(t: (key: string) => string): OrderCommandClarifyCandidate[] {
  return [
    { intent: "set_tab", label: t("order.agent.ex1") },
    { intent: "search", label: t("order.agent.ex2") },
    { intent: "reset_filters", label: t("order.agent.ex3") },
    { intent: "export_csv", label: t("order.agent.ex4") },
    { intent: "summary", label: t("order.agent.ex5") },
  ];
}

export function classifyOrderCommandInput(
  text: string,
  ctx: OrderClassifyContext
): OrderCommandClassifyResult {
  const raw = (text ?? "").trim();
  const lower = raw.toLowerCase();
  const t = ctx.t;

  if (!raw) {
    return {
      confidence: "none",
      source: "rules",
      clarify: { message: t("order.agent.clarify"), candidates: clarifyCandidates(t) },
    };
  }

  // 1) 导出
  if (["导出", "export", "csv", "下载订单", "下载"].some((k) => lower.includes(k))) {
    return high(buildOrderDraftFromIntent("export_csv"));
  }

  // 2) 统计分布
  if (["统计", "summary", "有多少", "多少单", "分布", "count orders", "count"].some((k) => lower.includes(k))) {
    return high(buildOrderDraftFromIntent("summary"));
  }

  // 3) 重置筛选
  if (["重置", "reset", "清空", "清除筛选", "清除"].some((k) => lower.includes(k))) {
    return high(buildOrderDraftFromIntent("reset_filters"));
  }

  // 4) 异常筛选
  if (["待核价", "no quote", "noquote", "quote pending", "pending quote"].some((k) => lower.includes(k))) {
    return high(buildOrderDraftFromIntent("set_exception", { exception: "noQuote" }));
  }
  if (["物流停滞", "stuck", "物流卡", "物流异常"].some((k) => lower.includes(k))) {
    return high(buildOrderDraftFromIntent("set_exception", { exception: "stuck" }));
  }
  if (lower.includes("异常") && (lower.includes("全部") || lower.includes("all"))) {
    return high(buildOrderDraftFromIntent("set_exception", { exception: "all" }));
  }

  // 5) 时间范围
  if (["近7天", "7天", "7d", "last 7", "最近7", "近一周"].some((k) => lower.includes(k))) {
    return high(buildOrderDraftFromIntent("set_time_range", { timeRange: "7d" }));
  }
  if (["近30天", "30天", "30d", "last 30", "最近30", "近一月"].some((k) => lower.includes(k))) {
    return high(buildOrderDraftFromIntent("set_time_range", { timeRange: "30d" }));
  }

  // 6) 选中 / 打开 Shopify（需订单号片段）
  const fragment = extractOrderFragment(raw);
  const wantsOpen = ["打开", "open", "后台", "shopify", "admin", "查看"].some((k) => lower.includes(k));
  const wantsFocus = ["定位", "选中", "focus", "找到", "高亮", "选择"].some((k) => lower.includes(k));
  if (fragment) {
    if (wantsOpen) {
      return high(buildOrderDraftFromIntent("open_shopify", { orderFragment: fragment }));
    }
    if (wantsFocus) {
      return high(buildOrderDraftFromIntent("focus_order", { orderFragment: fragment }));
    }
    // 仅给了一串数字（如「1010」）→ 当作搜索片段
    return high(buildOrderDraftFromIntent("search", { query: fragment }));
  }

  // 7) 切到某状态 Tab
  const status = matchStatus(lower);
  if (status) {
    return high(buildOrderDraftFromIntent("set_tab", { tab: status }));
  }

  // 8) 搜索（显式引导词，或纯文本兜底）
  if (["搜索", "search", "找", "查找", "查询", "包含", "含"].some((k) => lower.includes(k))) {
    const q = stripSearchVerb(raw);
    if (q) return high(buildOrderDraftFromIntent("search", { query: q }));
  }
  if (raw.length > 0) {
    return high(buildOrderDraftFromIntent("search", { query: raw }));
  }

  // 9) 无法识别 → 澄清候选
  return {
    confidence: "none",
    source: "rules",
    clarify: { message: t("order.agent.clarify"), candidates: clarifyCandidates(t) },
  };
}

function high(draft: OrderCommandDraft): OrderCommandClassifyResult {
  return { confidence: "high", source: "rules", draft };
}
