"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Image from "next/image";
import type { ClientAgentResponse } from "@/lib/agents/runtime/client";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import type { ShopProductMini } from "@/lib/agents/products/shop-minis";
import type { AgentSuggestedAction } from "@/lib/agents/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface IntentResultProps {
  intent: ProductsIntentId;
  response: ClientAgentResponse;
  context: ProductsPageContext;
  pendingMinis: ShopProductMini[];
  unboundMinis: ShopProductMini[];
  /** Hide strong CTA when priority card already owns that action */
  suppressPrimaryCta?: boolean;
  onAction: (action: AgentSuggestedAction) => void;
  onFocusProduct: (productId: string, opts?: { openSearch?: boolean }) => void;
}

/**
 * Intent-specific execution UIs — not a generic long-form report.
 */
export function ProductsIntentResult(props: IntentResultProps) {
  switch (props.intent) {
    case "summarize_shop_status":
      return <StatusExpanded {...props} />;
    case "explain_pricing":
      return <PricingExplainCard {...props} />;
    case "configure_pricing":
      return <ConfigurePricingCard {...props} />;
    case "go_pending":
      return <PendingMiniList {...props} />;
    case "go_unbound":
      return <UnboundMiniList {...props} />;
    case "go_discover":
      return <DiscoverBrief {...props} />;
    case "suggest_filters":
      return <FilterPresets {...props} />;
    case "propose_candidate_search":
      return <CandidateSearchProposal {...props} />;
    case "explain_match_reason":
    case "explain_match_risk":
    case "compare_current_candidate":
      return <ProductFocusExplain {...props} />;
    default:
      return <FallbackBrief {...props} />;
  }
}

function ExecShell({
  title,
  eyebrow,
  children,
  footer,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          {eyebrow ? (
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="text-xs font-semibold text-slate-900">{title}</h3>
        </div>
      </div>
      <div className="mt-1.5">{children}</div>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}

function TextLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline"
    >
      {label}
    </button>
  );
}

/** Always-visible fact strip — no CTA, no next-step copy. */
export function StatusFactSummary({
  context,
  onExpand,
}: {
  context: ProductsPageContext;
  onExpand?: () => void;
}) {
  const p = context.pricing;
  const pricingLine = p.configured
    ? `${p.targetCurrency ?? "—"} · 汇率 ${p.exchangeRate ?? "—"} · 倍率 ×${p.multiplier ?? "—"}`
    : "未配置";

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-800">店铺状态</p>
        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            查看完整分析
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px] leading-relaxed text-slate-600">
        <p>
          <span className="text-slate-400">定价</span> {pricingLine}
        </p>
        <p>
          <span className="text-slate-400">采购价展示</span>{" "}
          {context.purchaseDisplay.summaryLine.replace(/^采购价展示：/, "")}
        </p>
        <p>
          <span className="text-slate-400">已匹配</span>{" "}
          {context.matchedCount} / {context.analyzedCount}
        </p>
        <p>
          <span className="text-slate-400">待确认</span> {context.pendingCount}
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="text-slate-400">未匹配</span> {context.unboundCount}
        </p>
      </div>
    </div>
  );
}

function StatusExpanded({ response, context }: IntentResultProps) {
  const [open, setOpen] = useState(true);
  return (
    <ExecShell title="状态详情" eyebrow="任务">
      <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-700">
        <FactCell
          label="定价"
          value={
            context.pricing.configured
              ? context.pricing.summaryLine.replace(/^已配置：/, "")
              : "未配置"
          }
        />
        <FactCell
          label="已匹配"
          value={`${context.matchedCount} / ${context.analyzedCount}`}
        />
        <FactCell label="待确认" value={String(context.pendingCount)} />
        <FactCell label="未匹配" value={String(context.unboundCount)} />
      </div>
      {response.explanation.length > 0 ? (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <button
            type="button"
            className="text-[11px] font-medium text-slate-500"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "收起分析" : "展开分析摘要"}
          </button>
          {open ? (
            <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
              {response.explanation.slice(0, 4).map((line, i) => (
                <li key={`${i}-${line.slice(0, 20)}`}>· {line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </ExecShell>
  );
}

function FactCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-100 bg-slate-50/80 px-1.5 py-1">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="truncate font-medium text-slate-800">{value}</p>
    </div>
  );
}

function PricingExplainCard({
  context,
  onAction,
  suppressPrimaryCta,
}: IntentResultProps) {
  const p = context.pricing;
  return (
    <ExecShell
      title="定价因果链"
      eyebrow="任务"
      footer={
        suppressPrimaryCta ? null : (
          <TextLink
            label="查看 / 调整定价"
            onClick={() =>
              onAction({
                kind: "open_pricing_drawer",
                label: "查看 / 调整定价",
              })
            }
          />
        )
      }
    >
      <ol className="space-y-1 text-[11px] text-slate-700">
        <li>
          <span className="text-slate-400">1</span> 采购成本（RMB）
        </li>
        <li>
          <span className="text-slate-400">2</span>{" "}
          {p.configured
            ? `汇率 ${p.exchangeRate ?? "—"} → ${p.targetCurrency ?? "目标币"}`
            : "定价规则尚未有效配置"}
        </li>
        <li>
          <span className="text-slate-400">3</span>{" "}
          {p.configured
            ? `倍率 ×${p.multiplier ?? "—"}${
                p.addend ? ` · 加价 +${p.addend}` : ""
              } → 建议售价`
            : "配置后才会生成可信建议售价"}
        </li>
      </ol>
    </ExecShell>
  );
}

function ConfigurePricingCard({
  response,
  onAction,
  suppressPrimaryCta,
}: IntentResultProps) {
  return (
    <ExecShell
      title="配置定价"
      eyebrow="任务"
      footer={
        suppressPrimaryCta ? (
          <p className="text-[11px] text-slate-500">请使用上方「当前优先」完成配置。</p>
        ) : (
          <TextLink
            label="打开定价侧栏"
            onClick={() =>
              onAction({
                kind: "open_pricing_drawer",
                label: "打开定价侧栏",
              })
            }
          />
        )
      }
    >
      <p className="text-[11px] leading-relaxed text-slate-600">
        {response.explanation[0] ??
          "配置目标币种、汇率与倍率后，主区建议售价才会按你的规则计算。"}
      </p>
    </ExecShell>
  );
}

function MiniProductRow({
  item,
  onClick,
}: {
  item: ShopProductMini;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-left hover:border-slate-300"
    >
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-slate-100 bg-slate-50">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="32px"
            className="object-cover"
            unoptimized
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-slate-800">
          {item.title}
        </p>
        <p className="truncate text-[10px] text-slate-500">
          {item.hints.slice(0, 2).join(" · ") || "—"}
        </p>
      </div>
    </button>
  );
}

function PendingMiniList({
  pendingMinis,
  onFocusProduct,
  onAction,
  suppressPrimaryCta,
}: IntentResultProps) {
  const list = pendingMinis.slice(0, 5);
  return (
    <ExecShell
      title="待确认商品"
      eyebrow="任务"
      footer={
        suppressPrimaryCta || list.length > 0 ? null : (
          <TextLink
            label="定位待确认列表"
            onClick={() =>
              onAction({
                kind: "set_shop_filter",
                tab: "shop",
                shopFilter: "pending",
                label: "看待确认",
              })
            }
          />
        )
      }
    >
      {list.length === 0 ? (
        <p className="text-[11px] text-slate-500">暂无待确认商品。</p>
      ) : (
        <div className="space-y-1">
          {list.map((m) => (
            <MiniProductRow
              key={m.productId}
              item={m}
              onClick={() => onFocusProduct(m.productId)}
            />
          ))}
        </div>
      )}
    </ExecShell>
  );
}

function UnboundMiniList({
  unboundMinis,
  onFocusProduct,
  onAction,
  suppressPrimaryCta,
}: IntentResultProps) {
  const list = unboundMinis.slice(0, 5);
  return (
    <ExecShell
      title="未匹配商品"
      eyebrow="任务"
      footer={
        list[0] ? (
          <TextLink
            label="为第一项搜索候选"
            onClick={() =>
              onFocusProduct(list[0]!.productId, { openSearch: true })
            }
          />
        ) : suppressPrimaryCta ? null : (
          <TextLink
            label="定位未匹配列表"
            onClick={() =>
              onAction({
                kind: "set_shop_filter",
                tab: "shop",
                shopFilter: "unbound",
                label: "看未匹配",
              })
            }
          />
        )
      }
    >
      {list.length === 0 ? (
        <p className="text-[11px] text-slate-500">暂无未匹配商品。</p>
      ) : (
        <div className="space-y-1">
          {list.map((m) => (
            <MiniProductRow
              key={m.productId}
              item={m}
              onClick={() => onFocusProduct(m.productId)}
            />
          ))}
        </div>
      )}
    </ExecShell>
  );
}

function DiscoverBrief({ context, suppressPrimaryCta, onAction }: IntentResultProps) {
  return (
    <ExecShell
      title="发现新品"
      eyebrow="任务"
      footer={
        suppressPrimaryCta ? (
          <p className="text-[11px] text-slate-500">
            请使用上方「当前优先」打开发现新品。
          </p>
        ) : (
          <TextLink
            label="打开发现新品"
            onClick={() =>
              onAction({ kind: "set_tab", tab: "catalog", label: "打开发现新品" })
            }
          />
        )
      }
    >
      {context.recommendedCategoryNames.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {context.recommendedCategoryNames.map((n) => (
            <span
              key={n}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700"
            >
              {n}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">暂无推荐类目。</p>
      )}
      <p className="mt-1.5 text-[10px] text-slate-500">
        {context.filterSummary.length > 0
          ? `当前筛选：${context.filterSummary.join(" · ")}`
          : "尚未应用额外筛选。"}
      </p>
    </ExecShell>
  );
}

function FilterPresets({ context, onAction }: IntentResultProps) {
  const presets = context.recommendedCategoryNames.slice(0, 3).map((name) => ({
    kind: "apply_filter_preset" as const,
    tab: "catalog" as const,
    filterPreset: { categoryName: name, label: name },
    label: name,
  }));

  return (
    <ExecShell title="筛选建议" eyebrow="任务">
      {presets.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          暂无推荐类目预设。可在发现新品页手动筛选。
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] text-slate-500">一键应用（真实类目）：</p>
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onAction(p)}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] font-medium text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </ExecShell>
  );
}

function CandidateSearchProposal({
  context,
  onAction,
  onFocusProduct,
}: IntentResultProps) {
  if (context.focusProductId && context.focusProduct) {
    const focus = context.focusProduct;
    return (
      <ExecShell
        title="为这个商品找更多候选"
        eyebrow="当前商品"
        footer={
          <Button
            size="sm"
            className="h-8 w-full"
            onClick={() =>
              onFocusProduct(focus.productId, { openSearch: true })
            }
          >
            打开图搜托盘
          </Button>
        }
      >
        <p className="text-[11px] font-medium text-slate-800">{focus.title}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          将重新图搜 Tangbuy 货源（最多 5 个候选），不会自动改绑已确认关联。
        </p>
      </ExecShell>
    );
  }

  if (context.unboundCount <= 0) {
    return (
      <ExecShell
        title="重搜候选"
        eyebrow="任务"
        footer={
          <div className="flex flex-wrap gap-3">
            {context.pendingCount > 0 ? (
              <TextLink
                label="看待确认"
                onClick={() =>
                  onAction({
                    kind: "set_shop_filter",
                    tab: "shop",
                    shopFilter: "pending",
                    label: "看待确认",
                  })
                }
              />
            ) : (
              <TextLink
                label="发现新品"
                onClick={() =>
                  onAction({ kind: "set_tab", tab: "catalog", label: "发现新品" })
                }
              />
            )}
          </div>
        }
      >
        <p className="text-[11px] text-slate-600">暂无未关联商品。</p>
      </ExecShell>
    );
  }

  return (
    <ExecShell
      title="重搜候选"
      eyebrow="任务"
      footer={
        <Button
          size="sm"
          className="h-8 w-full"
          onClick={() =>
            onAction({
              kind: "rematch_unbound",
              tab: "shop",
              label: "重搜全部未匹配",
            })
          }
        >
          重搜 {context.unboundCount} 个未匹配
        </Button>
      }
    >
      <p className="text-[11px] text-slate-600">
        为全部未关联商品重新图搜，已关联的不会改绑。
      </p>
    </ExecShell>
  );
}

function ProductFocusExplain({
  intent,
  response,
  context,
  onAction,
  onFocusProduct,
  suppressPrimaryCta,
}: IntentResultProps) {
  const focus = context.focusProduct;
  const title =
    intent === "explain_match_reason"
      ? "为什么推荐这个货源"
      : intent === "explain_match_risk"
        ? "匹配不确定点"
        : "候选对比";

  if (!focus) {
    return (
      <ExecShell title="请先选择商品" eyebrow="任务">
        <p className="text-[11px] text-slate-600">
          在「我的 Shopify」中点击商品卡片，再查看推荐依据或不确定点。
        </p>
      </ExecShell>
    );
  }

  const action = response.suggestedAction;
  const showCta =
    !suppressPrimaryCta &&
    action.kind !== "none" &&
    action.label;

  return (
    <ExecShell
      title={title}
      eyebrow="当前商品"
      footer={
        showCta ? (
          <TextLink
            label={action.label!}
            onClick={() => {
              if (action.kind === "open_candidate_search" && action.productId) {
                onFocusProduct(action.productId, { openSearch: true });
              } else if (action.kind === "focus_product" && action.productId) {
                onFocusProduct(action.productId);
              } else {
                onAction(action);
              }
            }}
          />
        ) : null
      }
    >
      <p className="text-[11px] font-medium text-slate-800">{focus.title}</p>
      {focus.purchaseCostLabel ? (
        <p className="mt-1 text-[10px] text-slate-500">
          采购成本 {focus.purchaseCostLabel}
          {focus.profitLabel ? ` · 每单约 ${focus.profitLabel}` : ""}
        </p>
      ) : null}
      <ul className="mt-2 space-y-0.5 text-[11px] text-slate-600">
        {response.explanation.map((line, i) => (
          <li key={`${i}-${line.slice(0, 16)}`}>· {line}</li>
        ))}
      </ul>
    </ExecShell>
  );
}

function FallbackBrief({ response }: IntentResultProps) {
  return (
    <ExecShell title={response.summary} eyebrow="任务">
      <ul className="space-y-0.5 text-[11px] text-slate-600">
        {response.explanation.slice(0, 3).map((line, i) => (
          <li key={`${i}-${line.slice(0, 16)}`}>· {line}</li>
        ))}
      </ul>
    </ExecShell>
  );
}

/** Compact light priority card — one soft CTA only. */
export function ActiveTaskCard({
  title,
  reason,
  action,
  onAction,
}: {
  title: string;
  reason: string;
  action: AgentSuggestedAction;
  onAction: (a: AgentSuggestedAction) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-emerald-200/70 bg-emerald-50/40 px-2.5 py-2"
      )}
    >
      <p className="text-[10px] font-medium tracking-wide text-emerald-800/70">
        当前优先
      </p>
      <h3 className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
        {title}
      </h3>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
        {reason}
      </p>
      {action.kind !== "none" && action.label ? (
        <button
          type="button"
          onClick={() => onAction(action)}
          className="mt-1.5 text-xs font-semibold text-emerald-800 underline-offset-2 hover:underline"
        >
          {action.label} →
        </button>
      ) : null}
    </div>
  );
}
