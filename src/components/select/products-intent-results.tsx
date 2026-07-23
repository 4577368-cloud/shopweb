"use client";

import type { ReactNode } from "react";
import { ThumbImage } from "@/components/ui/thumb-image";
import type { ClientAgentResponse } from "@/lib/agents/runtime/client";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { purchaseDisplayAlignedWithPricing } from "@/lib/agents/products/page-context";
import type { ShopProductMini } from "@/lib/agents/products/shop-minis";
import type { AgentSuggestedAction } from "@/lib/agents/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";

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
  onCollapse,
}: {
  context: ProductsPageContext;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const t = useT();
  const p = context.pricing;
  const purchaseAligned = purchaseDisplayAlignedWithPricing(p, context.purchaseDisplay);
  const pricingLine = p.configured
    ? t("productsIntent.pricingLine", {
        currency: p.targetCurrency ?? "—",
        rate: p.exchangeRate ?? "—",
        multiplier: p.multiplier ?? "—",
      })
    : t("productsIntent.notConfigured");

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-800">{t("productsIntent.shopStatus")}</p>
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="text-[11px] font-medium text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
          >
            {t("productsIntent.collapseAnalysis")}
          </button>
        ) : onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            className="text-[11px] font-medium text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
          >
            {t("productsIntent.expandAnalysis")}
          </button>
        ) : null}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px] leading-relaxed text-slate-600">
        <p>
          <span className="text-slate-400">{t("productsIntent.pricing")}</span> {pricingLine}
          {purchaseAligned ? (
            <span className="text-slate-500">{t("productsIntent.purchaseAligned")}</span>
          ) : null}
        </p>
        {!purchaseAligned ? (
          <p>
            <span className="text-slate-400">{t("productsIntent.purchaseDisplay")}</span>{" "}
            {context.purchaseDisplay.summaryLine}
          </p>
        ) : null}
        <p>
          <span className="text-slate-400">{t("productsIntent.matched")}</span>{" "}
          {t("productsIntent.matchedCount", {
            matched: context.matchedCount,
            analyzed: context.analyzedCount,
          })}
        </p>
        <p>
          <span className="text-slate-400">{t("productsIntent.pending")}</span> {context.pendingCount}
          <span className="mx-1.5 text-slate-300">·</span>
          <span className="text-slate-400">{t("productsIntent.unbound")}</span> {context.unboundCount}
        </p>
      </div>
    </div>
  );
}

function StatusExpanded({ response, context }: IntentResultProps) {
  const t = useT();
  return (
    <ExecShell title={t("productsIntent.statusDetails")} eyebrow={t("productsIntent.task")}>
      <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-700">
        <FactCell
          label={t("productsIntent.pricing")}
          value={
            context.pricing.configured
              ? t("productsIntent.pricingLine", {
                  currency: context.pricing.targetCurrency ?? "—",
                  rate: context.pricing.exchangeRate ?? "—",
                  multiplier: context.pricing.multiplier ?? "—",
                })
              : t("productsIntent.notConfigured")
          }
        />
        <FactCell
          label={t("productsIntent.matched")}
          value={t("productsIntent.matchedCount", {
            matched: context.matchedCount,
            analyzed: context.analyzedCount,
          })}
        />
        <FactCell label={t("productsIntent.pending")} value={String(context.pendingCount)} />
        <FactCell label={t("productsIntent.unbound")} value={String(context.unboundCount)} />
      </div>
      {response.explanation.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[11px] text-slate-600">
          {response.explanation.slice(0, 4).map((line, i) => (
            <li key={`${i}-${line.slice(0, 20)}`}>· {line}</li>
          ))}
        </ul>
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
}: IntentResultProps) {
  const t = useT();
  const p = context.pricing;
  if (p.configured) {
    return (
      <ExecShell
        title={t("productsIntent.pricingReady")}
        eyebrow={t("productsIntent.completed")}
        footer={
          <TextLink
            label={t("productsIntent.viewAdjustPricing")}
            onClick={() =>
              onAction({
                kind: "open_pricing_drawer",
                label: t("productsIntent.viewAdjustPricing"),
              })
            }
          />
        }
      >
        <ol className="space-y-1 text-[11px] text-slate-700">
          <li>
            <span className="text-slate-400">1</span> {t("productsIntent.purchaseCostRmb")}
          </li>
          <li>
            <span className="text-slate-400">2</span>{" "}
            {t("productsIntent.fxToTarget", {
              rate: p.exchangeRate ?? "—",
              currency: p.targetCurrency ?? "—",
            })}
          </li>
          <li>
            <span className="text-slate-400">3</span>{" "}
            {t("productsIntent.multiplierAddend", {
              multiplier: p.multiplier ?? "—",
              addend: p.addend
                ? t("productsIntent.addendSuffix", { addend: p.addend })
                : "",
            })}
          </li>
        </ol>
        <p className="mt-2 text-[10px] text-slate-500">
          {t("productsIntent.pricingActive")}
        </p>
      </ExecShell>
    );
  }
  return (
    <ExecShell
      title={t("productsIntent.pricingChain")}
      eyebrow={t("productsIntent.task")}
      footer={
        <TextLink
          label={t("productsIntent.openPricingDrawer")}
          onClick={() =>
            onAction({
              kind: "open_pricing_drawer",
              label: t("productsIntent.openPricingDrawer"),
            })
          }
        />
      }
    >
      <ol className="space-y-1 text-[11px] text-slate-700">
        <li>
          <span className="text-slate-400">1</span> {t("productsIntent.purchaseCostRmb")}
        </li>
        <li>
          <span className="text-slate-400">2</span> {t("productsIntent.pricingNotConfigured")}
        </li>
        <li>
          <span className="text-slate-400">3</span> {t("productsIntent.pricingAfterConfig")}
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
  const t = useT();
  return (
    <ExecShell
      title={t("productsIntent.configurePricing")}
      eyebrow={t("productsIntent.task")}
      footer={
        suppressPrimaryCta ? (
          <p className="text-[11px] text-slate-500">{t("productsIntent.usePriorityCard")}</p>
        ) : (
          <TextLink
            label={t("productsIntent.openPricingDrawer")}
            onClick={() =>
              onAction({
                kind: "open_pricing_drawer",
                label: t("productsIntent.openPricingDrawer"),
              })
            }
          />
        )
      }
    >
      <p className="text-[11px] leading-relaxed text-slate-600">
        {response.explanation[0] ?? t("productsIntent.configurePricingHint")}
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
          <ThumbImage
            src={item.imageUrl}
            alt=""
            fill
            sizes="32px"
            pixelWidth={64}
            className="object-cover"
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
  const t = useT();
  const list = pendingMinis.slice(0, 5);
  return (
    <ExecShell
      title={t("productsIntent.pendingProducts")}
      eyebrow={t("productsIntent.task")}
      footer={
        suppressPrimaryCta || list.length > 0 ? null : (
          <TextLink
            label={t("productsIntent.locatePendingList")}
            onClick={() =>
              onAction({
                kind: "set_shop_filter",
                tab: "shop",
                shopFilter: "pending",
                label: t("productsIntent.viewPendingLabel"),
              })
            }
          />
        )
      }
    >
      {list.length === 0 ? (
        <p className="text-[11px] text-slate-500">{t("productsIntent.noPendingProducts")}</p>
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
  const t = useT();
  const list = unboundMinis.slice(0, 5);
  return (
    <ExecShell
      title={t("productsIntent.unboundProducts")}
      eyebrow={t("productsIntent.task")}
      footer={
        list[0] ? (
          <TextLink
            label={t("productsIntent.searchFirstItem")}
            onClick={() =>
              onFocusProduct(list[0]!.productId, { openSearch: true })
            }
          />
        ) : suppressPrimaryCta ? null : (
          <TextLink
            label={t("productsIntent.locateUnboundList")}
            onClick={() =>
              onAction({
                kind: "set_shop_filter",
                tab: "shop",
                shopFilter: "unbound",
                label: t("productsIntent.viewUnboundLabel"),
              })
            }
          />
        )
      }
    >
      {list.length === 0 ? (
        <p className="text-[11px] text-slate-500">{t("productsIntent.noUnboundProducts")}</p>
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
  const t = useT();
  return (
    <ExecShell
      title={t("productsIntent.discoverNew")}
      eyebrow={t("productsIntent.task")}
      footer={
        suppressPrimaryCta ? (
          <p className="text-[11px] text-slate-500">
            {t("productsIntent.usePriorityCard")}
          </p>
        ) : (
          <TextLink
            label={t("productsIntent.openDiscover")}
            onClick={() =>
              onAction({
                kind: "set_tab",
                tab: "catalog",
                label: t("productsIntent.openDiscoverLabel"),
              })
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
        <p className="text-[11px] text-slate-500">{t("productsIntent.noRecommendedCategories")}</p>
      )}
      <p className="mt-1.5 text-[10px] text-slate-500">
        {context.filterSummary.length > 0
          ? t("productsIntent.currentFilters", {
              filters: context.filterSummary.join(" · "),
            })
          : t("productsIntent.noExtraFilters")}
      </p>
    </ExecShell>
  );
}

function FilterPresets({ context, onAction }: IntentResultProps) {
  const t = useT();
  const presets = context.recommendedCategoryNames.slice(0, 3).map((name) => ({
    kind: "apply_filter_preset" as const,
    tab: "catalog" as const,
    filterPreset: { categoryName: name, label: name },
    label: name,
  }));

  return (
    <ExecShell title={t("productsIntent.filterSuggestions")} eyebrow={t("productsIntent.task")}>
      {presets.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          {t("productsIntent.noCategoryPresets")}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] text-slate-500">{t("productsIntent.applyOneClick")}</p>
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
  const t = useT();
  if (context.focusProductId && context.focusProduct) {
    const focus = context.focusProduct;
    return (
      <ExecShell
        title={t("productsIntent.findMoreCandidates")}
        eyebrow={t("productsIntent.currentProduct")}
        footer={
          <Button
            size="sm"
            className="h-8 w-full"
            onClick={() =>
              onFocusProduct(focus.productId, { openSearch: true })
            }
          >
            {t("productsIntent.openImageSearch")}
          </Button>
        }
      >
        <p className="text-[11px] font-medium text-slate-800">{focus.title}</p>
        <p className="mt-1 text-[11px] text-slate-600">
          {t("productsIntent.imageSearchHint")}
        </p>
      </ExecShell>
    );
  }

  if (context.unboundCount <= 0) {
    return (
      <ExecShell
        title={t("productsIntent.rerunCandidates")}
        eyebrow={t("productsIntent.task")}
        footer={
          <div className="flex flex-wrap gap-3">
            {context.pendingCount > 0 ? (
              <TextLink
                label={t("productsIntent.viewPending")}
                onClick={() =>
                  onAction({
                    kind: "set_shop_filter",
                    tab: "shop",
                    shopFilter: "pending",
                    label: t("productsIntent.viewPendingLabel"),
                  })
                }
              />
            ) : (
              <TextLink
                label={t("productsIntent.openDiscover")}
                onClick={() =>
                  onAction({
                    kind: "set_tab",
                    tab: "catalog",
                    label: t("productsIntent.openDiscoverLabel"),
                  })
                }
              />
            )}
          </div>
        }
      >
        <p className="text-[11px] text-slate-600">{t("productsIntent.noUnlinkedProducts")}</p>
      </ExecShell>
    );
  }

  return (
    <ExecShell
      title={t("productsIntent.rerunCandidates")}
      eyebrow={t("productsIntent.task")}
      footer={
        <Button
          size="sm"
          className="h-8 w-full"
          onClick={() =>
            onAction({
              kind: "rematch_unbound",
              tab: "shop",
              label: t("productsIntent.rerunAllUnbound"),
            })
          }
        >
          {t("productsIntent.rerunUnboundCount", { count: context.unboundCount })}
        </Button>
      }
    >
      <p className="text-[11px] text-slate-600">
        {t("productsIntent.rerunUnboundHint")}
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
  const t = useT();
  const focus = context.focusProduct;
  const title =
    intent === "explain_match_reason"
      ? t("productsIntent.explainMatchReason")
      : intent === "explain_match_risk"
        ? t("productsIntent.explainMatchRisk")
        : t("productsIntent.compareCandidates");

  if (!focus) {
    return (
      <ExecShell title={t("productsIntent.selectProductFirst")} eyebrow={t("productsIntent.task")}>
        <p className="text-[11px] text-slate-600">
          {t("productsIntent.selectProductHint")}
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
      eyebrow={t("productsIntent.currentProduct")}
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
          {t("productsIntent.purchaseCost", { cost: focus.purchaseCostLabel })}
          {focus.profitLabel
            ? t("productsIntent.profitPerOrder", { profit: focus.profitLabel })
            : ""}
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
  const t = useT();
  return (
    <ExecShell title={response.summary} eyebrow={t("productsIntent.task")}>
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
  const t = useT();
  return (
    <div
      className={cn(
        "rounded-md border border-brand-accent/20 bg-brand-soft/50 px-2.5 py-2"
      )}
    >
      <p className="text-[10px] font-medium tracking-wide text-brand-accent/80">
        {t("productsIntent.currentPriority")}
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
          className="mt-1.5 text-xs font-semibold text-link hover:text-link-hover underline-offset-2 hover:underline"
        >
          {action.label} →
        </button>
      ) : null}
    </div>
  );
}
