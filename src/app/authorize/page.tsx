"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  LineChart,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import {
  AssistantRail,
  CopilotCard,
  type AssistantSuggestion,
} from "@/components/workbench/assistant-rail";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useOnboarding } from "@/context/onboarding-context";
import { api } from "@/lib/api";
import { SHOP_STORAGE_KEY, launchShopifyInstall } from "@/lib/shopify-install";
import type { AiPanelContent } from "@/lib/types";
import { cn } from "@/lib/utils";

const trustSignals = [
  "官方安全授权",
  "数据加密传输",
  "只读访问权限",
  "不会修改你的店铺数据",
];

const capabilities: { icon: typeof Database; title: string; desc: string }[] = [
  {
    icon: Database,
    title: "同步基础数据",
    desc: "自动同步商品、库存、订单等基础数据",
  },
  {
    icon: LineChart,
    title: "分析店铺表现",
    desc: "AI 分析热销品、利润空间、流量来源等",
  },
  {
    icon: Sparkles,
    title: "发现优化机会",
    desc: "找到可替换商品、降本机会和利润增长点",
  },
  {
    icon: Boxes,
    title: "推荐优供应链",
    desc: "匹配更优供应链，提升利润和履约效率",
  },
];

type Phase = "unbound" | "restoring" | "authorized";
type ProductSyncState = "idle" | "syncing" | "done" | "error";

/** 已同步商品展示：成功且为 0 → 暂无商品；未拉到数据 → 暂未获取。 */
function formatSyncedProductLabel(
  state: ProductSyncState,
  count: number
): string {
  if (state === "syncing") return "同步中…";
  if (state === "error" || state === "idle") return "暂未获取";
  return count === 0 ? "暂无商品" : String(count);
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("zh-CN", { hour12: false });
}

export default function AuthorizePage() {
  const {
    authStatus,
    shopDomainInput,
    setShopDomainInput,
    shop,
    isAuthorized,
    authSessionReady,
    showToast,
    hydrateAuthorizedShop,
  } = useOnboarding();

  const [refreshing, setRefreshing] = useState(false);
  const [boundCount, setBoundCount] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  const [editingDomain, setEditingDomain] = useState(false);
  const [savedShop, setSavedShop] = useState<string | null>(null);
  const [productSyncState, setProductSyncState] =
    useState<ProductSyncState>("idle");
  const [mirrorProductCount, setMirrorProductCount] = useState<number | null>(
    null
  );
  const syncAttemptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSavedShop(window.localStorage.getItem(SHOP_STORAGE_KEY));
  }, [authSessionReady]);

  // Real post-auth stats: 已关联货源 (distinct bound products) + 已刊登 (catalog publishes still on Shopify).
  const loadStats = useCallback(async (shopName: string) => {
    try {
      const [list, published] = await Promise.all([
        api.listImageBindings(shopName),
        api.getPublishedCount(shopName).catch(() => ({ count: 0 })),
      ]);
      const distinct = new Set(
        list
          .filter((b) => b.bound && b.thirdPlatformItemId)
          .map((b) => b.thirdPlatformItemId)
      );
      setBoundCount(distinct.size);
      setPublishedCount(published.count ?? 0);
    } catch {
      setBoundCount(null);
    }
  }, []);

  // Once authorized, read the real "已关联货源数" from the same source /products uses.
  // Re-run whenever the active shop changes (multi-shop switcher).
  useEffect(() => {
    if (!isAuthorized) return;
    setBoundCount(null);
    setPublishedCount(null);
    void loadStats(shop.name);
  }, [isAuthorized, shop.name, loadStats]);

  const pullProductMirror = useCallback(async () => {
    const shopName = shop.name;
    const shopDomain = shop.domain;
    if (!shopName || !shopDomain) return null;

    setProductSyncState("syncing");
    try {
      const synced = await api.syncShopProducts(shopName);
      const status = await api.getShopStatus(shopDomain);
      const list = await api.getShopProducts(shopName).catch(() => []);
      const count = Math.max(
        synced.productCount ?? 0,
        status.productCount ?? 0,
        list.length
      );

      setMirrorProductCount(count);
      hydrateAuthorizedShop({
        name: status.shopName ?? shopName,
        domain: status.shopDomain ?? shopDomain,
        authorizedAt:
          fmtDate(status.authorizedAt) || (shop.authorizedAt ?? ""),
        productCount: count,
      });
      setProductSyncState("done");
      return count;
    } catch {
      setProductSyncState("error");
      return null;
    }
  }, [
    shop.name,
    shop.domain,
    shop.authorizedAt,
    hydrateAuthorizedShop,
  ]);

  // After OAuth, backend auth status often lags product mirror — pull once automatically.
  useEffect(() => {
    if (!isAuthorized || !shop.name || !shop.domain) return;
    if (shop.productCount > 0) {
      setMirrorProductCount(shop.productCount);
      setProductSyncState("done");
      return;
    }
    if (syncAttemptedRef.current) return;
    syncAttemptedRef.current = true;
    void pullProductMirror();
  }, [isAuthorized, shop.name, shop.domain, shop.productCount, pullProductMirror]);

  // Re-check status + bound count so the async post-auth product sync can surface without a reload.
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const pulled = await pullProductMirror();
      if (pulled == null) {
        const status = await api.getShopStatus(shop.domain);
        if (status.authorized) {
          hydrateAuthorizedShop({
            name: status.shopName ?? shop.name,
            domain: status.shopDomain ?? shop.domain,
            authorizedAt: fmtDate(status.authorizedAt) || (shop.authorizedAt ?? ""),
            productCount: status.productCount ?? 0,
          });
          setMirrorProductCount(status.productCount ?? 0);
          await loadStats(status.shopName ?? shop.name);
        }
        showToast("商品数暂未获取，请稍后重试");
        return;
      }
      await loadStats(shop.name);
    } catch {
      showToast("刷新失败，请稍后重试");
    } finally {
      setRefreshing(false);
    }
  }, [
    refreshing,
    shop.domain,
    shop.name,
    shop.authorizedAt,
    hydrateAuthorizedShop,
    loadStats,
    pullProductMirror,
    showToast,
  ]);

  // Fallback connect on the return-landing page: reuse the shared launcher (validate → remember →
  // full-page navigate to the backend install → Shopify consent). No OAuth logic lives here.
  const startShopifyInstall = (explicitDomain?: string) => {
    const result = launchShopifyInstall(explicitDomain ?? shopDomainInput);
    if (!result.ok) {
      setEditingDomain(true);
      if (result.error) showToast(result.error);
    }
  };

  const authorizing = authStatus === "authorizing";
  const phase: Phase = isAuthorized
    ? "authorized"
    : !authSessionReady
      ? "restoring"
      : "unbound";
  const trimmedDomain = shopDomainInput.trim();
  const hasPrefilledShop = Boolean(savedShop) && !editingDomain && Boolean(trimmedDomain);
  const displayProductCount = mirrorProductCount ?? shop.productCount;
  const syncing = productSyncState === "syncing";
  const syncedProductLabel = formatSyncedProductLabel(
    productSyncState,
    displayProductCount
  );

  const { copilot, suggestions } = buildAssistant(phase, {
    shopName: shop.name,
    shopDomain: shop.domain,
    authorizedAt: shop.authorizedAt,
    productCount: displayProductCount,
    boundCount,
    productSyncState,
    canConnect: Boolean(trimmedDomain) && !authorizing,
    onConnect: () => startShopifyInstall(),
  });

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <CopilotCard
              content={copilot}
              suggestions={suggestions}
              suggestionsKey={phase}
              onNextAction={(action) => {
                if (action === "connect") startShopifyInstall();
              }}
            />
          }
        />
      }
    >
      <WorkbenchPanel
        title="授权店铺"
        actions={
          isAuthorized ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => startShopifyInstall(shop.domain)}
              >
                <RefreshCw className="h-4 w-4" />
                重新授权
              </Button>
              <Link href="/products">
                <Button>
                  进入智能选品
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-brand" />
              安全加密 · 官方授权
            </span>
          )
        }
      >
        <div className="space-y-4">
          <section className="rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
            <div className="border-b border-hairline px-5 py-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-ink">
                  连接你的 Shopify 店铺
                </h2>
                {phase === "authorized" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    className="h-7 w-7 shrink-0 px-0"
                    title="刷新接入摘要"
                    aria-label="刷新"
                  >
                    {refreshing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">
                只需 2 步，即可开始 AI 分析并优化你的店铺
              </p>
            </div>

            <div className="px-5 py-5">
              <TwoStepProgress authorizing={authorizing} phase={phase} syncing={syncing} />

              {phase === "authorized" ? (
                <ConnectSummary
                  name={shop.name}
                  domain={shop.domain}
                  authorizedAt={shop.authorizedAt}
                  syncedProductLabel={syncedProductLabel}
                  boundCount={boundCount}
                  publishedCount={publishedCount}
                />
              ) : phase === "restoring" ? (
                <RestoringBlock />
              ) : (
                <div className="mt-5 space-y-3">
                  {/* CTA-first: connecting is the hero action; domain is a secondary, prefilled field. */}
                  <Button
                    className="w-full"
                    onClick={() => startShopifyInstall()}
                    disabled={authorizing}
                  >
                    {authorizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        授权中…
                      </>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" />
                        {hasPrefilledShop
                          ? `连接 ${trimmedDomain}`
                          : "连接 Shopify 店铺"}
                      </>
                    )}
                  </Button>

                  {hasPrefilledShop ? (
                    <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-3 py-2">
                      <span className="min-w-0 truncate text-xs text-ink-muted">
                        将连接上次的店铺：
                        <span className="font-medium text-ink">{trimmedDomain}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingDomain(true)}
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-strong hover:underline"
                      >
                        <Pencil className="h-3 w-3" />
                        换个店铺
                      </button>
                    </div>
                  ) : (
                    <Field
                      label="店铺域名"
                      hint="首次连接需填写，例如 northwind-home.myshopify.com"
                    >
                      <div className="relative">
                        <Input
                          value={shopDomainInput}
                          onChange={(e) => setShopDomainInput(e.target.value)}
                          placeholder="your-store.myshopify.com"
                          disabled={authorizing}
                          className="pr-9"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
                          <ShieldCheck className="h-4 w-4" />
                        </span>
                      </div>
                    </Field>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline px-5 py-3">
              {trustSignals.map((signal) => (
                <span
                  key={signal}
                  className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                  {signal}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-sm font-semibold text-ink">
              连接后，AI 将自动为你完成
            </h3>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {capabilities.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3.5 py-3.5 shadow-card"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-2.5 text-sm font-medium text-ink">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                    {desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-emerald-100 bg-brand-soft px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-medium text-ink">
                  我们如何使用你的数据？
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                  我们仅读取必要数据用于分析和服务交付，不会修改、删除或泄露你的任何数据。
                </p>
              </div>
            </div>
            <Link
              href="#"
              className="shrink-0 text-xs font-medium text-brand-strong hover:underline"
            >
              了解更多 →
            </Link>
          </section>
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

/** Builds the state-driven copilot content + guided suggestions (Phase A: fixed, real answers). */
function buildAssistant(
  phase: Phase,
  ctx: {
    shopName: string;
    shopDomain: string;
    authorizedAt?: string;
    productCount: number;
    boundCount: number | null;
    productSyncState: ProductSyncState;
    canConnect: boolean;
    onConnect: () => void;
  }
): { copilot: AiPanelContent; suggestions: AssistantSuggestion[] } {
  const {
    shopName,
    shopDomain,
    authorizedAt,
    productCount,
    boundCount,
    productSyncState,
    canConnect,
  } = ctx;

  if (phase === "authorized") {
    const boundText =
      boundCount != null ? `，其中 ${boundCount} 个已关联 Tangbuy 货源` : "";
    const syncedSummary =
      productSyncState === "done"
        ? productCount === 0
          ? "Shopify 店铺暂无商品"
          : `已同步 ${productCount} 个商品`
        : productSyncState === "syncing"
          ? "商品同步进行中"
          : "商品数暂未获取";
    return {
      copilot: {
        title: "接入完成",
        summary: `已连接 ${shopName}（${shopDomain}）。${syncedSummary}${boundText}。`,
        bullets: [
          `授权时间：${authorizedAt || "—"}`,
          `已同步商品：${formatSyncedProductLabel(productSyncState, productCount)}`,
          boundCount != null ? `已关联货源：${boundCount} 个` : "已关联货源：读取中…",
        ],
        nextAction: { label: "进入智能选品", href: "/products" },
      },
      suggestions: [
        {
          id: "next",
          q: "接下来做什么？",
          a:
            boundCount != null && boundCount > 0
              ? `建议前往「智能选品」继续为在售商品关联货源，当前已关联 ${boundCount} 个。`
              : "建议前往「智能选品」，为在售商品自动图搜关联 Tangbuy 货源。",
        },
        {
          id: "count0",
          q: "「暂无商品」和「暂未获取」有什么区别？",
          a: "「暂无商品」表示已成功拉取且 Shopify 店铺确实没有商品；「暂未获取」表示同步未完成或接口异常，可点刷新重试。",
        },
        {
          id: "bound",
          q: "“已关联货源”是什么？",
          a:
            boundCount != null
              ? `指已确认绑定 Tangbuy 货源的在售商品数，当前为 ${boundCount} 个。`
              : "指已确认绑定 Tangbuy 货源的在售商品数，正在读取。",
        },
      ],
    };
  }

  if (phase === "restoring") {
    return {
      copilot: {
        title: "正在接入",
        summary: "正在恢复授权状态并读取店铺基础数据，请稍候…",
        bullets: ["校验 Shopify 授权", "读取店铺与已同步商品", "准备货源关联概览"],
      },
      suggestions: [
        {
          id: "doing",
          q: "现在在做什么？",
          a: "正在校验你的 Shopify 授权并读取店铺基础数据。",
        },
        {
          id: "wait",
          q: "需要我操作吗？",
          a: "不需要，恢复完成后本页会自动展示接入摘要。",
        },
      ],
    };
  }

  // unbound
  return {
    copilot: {
      title: "开始接入",
      summary:
        "Hi！我是 Tangbuy AI Copilot。连接 Shopify 后，我会自动同步商品，并在后续为你匹配 Tangbuy 货源、优化利润。",
      bullets: [
        "整页跳转至 Shopify 官方授权，安全只读",
        "授权后自动同步商品镜像",
        "随后可在「智能选品」自动关联货源",
      ],
      nextAction: {
        label: canConnect ? "连接 Shopify 店铺" : "填写店铺域名",
        action: "connect",
        disabled: !canConnect,
        disabledReason: canConnect
          ? undefined
          : "请先在中间填写店铺域名，再发起授权。",
      },
    },
    suggestions: [
      {
        id: "how",
        q: "如何连接店铺？",
        a: "点击「连接 Shopify 店铺」会跳转到 Shopify 官方授权页，确认后自动返回本页。首次需填写你的 .myshopify.com 域名。",
      },
      {
        id: "data",
        q: "会读取我哪些数据？",
        a: "仅只读读取商品、库存、订单等基础数据用于分析与货源匹配，不会修改或删除你的店铺数据。",
      },
      {
        id: "time",
        q: "授权要多久？",
        a: "通常 1 分钟内完成。授权成功后系统会自动在后台同步商品镜像。",
      },
    ],
  };
}

function TwoStepProgress({
  authorizing,
  phase,
  syncing,
}: {
  authorizing: boolean;
  phase: Phase;
  syncing?: boolean;
}) {
  const connecting = authorizing || phase === "restoring";
  const authorized = phase === "authorized";
  const step1Done = authorized || connecting;
  const step2Active = connecting;
  const step2Done = authorized;

  return (
    <div className="flex items-center gap-3">
      <StepPill index={1} label="选择店铺" done={step1Done} active={!step1Done} />
      {/* When authorized, the connector carries the "授权成功" status badge (centered over the line). */}
      <div className="relative flex flex-1 items-center">
        <span
          className={cn(
            "h-px w-full",
            authorized ? "bg-brand" : step1Done ? "bg-brand/40" : "bg-hairline"
          )}
        />
        {authorized ? (
          <span className="absolute left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-brand-soft px-3 py-1 text-xs font-medium text-brand-strong shadow-card">
            <ShieldCheck className="h-3.5 w-3.5" />
            授权成功{syncing ? " · 同步中" : ""}
          </span>
        ) : null}
      </div>
      <StepPill
        index={2}
        label="授权并连接"
        done={step2Done}
        active={step2Active}
        loading={connecting}
      />
    </div>
  );
}

function StepPill({
  index,
  label,
  done,
  active,
  loading,
}: {
  index: number;
  label: string;
  done: boolean;
  active: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
          done || active
            ? "bg-brand text-white"
            : "border border-hairline-strong text-ink-subtle"
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          index
        )}
      </span>
      <span
        className={cn(
          "text-xs font-medium",
          done || active ? "text-ink" : "text-ink-subtle"
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Post-redirect "接入中" state: real status restore, no fake scanning. */
function RestoringBlock() {
  return (
    <div className="mt-5 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-4 py-4">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <Loader2 className="h-4 w-4 animate-spin text-brand" />
        正在恢复授权状态…
      </div>
      <ul className="mt-2.5 space-y-1.5 text-xs text-ink-muted">
        <li>· 校验 Shopify 授权</li>
        <li>· 读取店铺与已同步商品</li>
        <li>· 正在同步店铺基础数据</li>
      </ul>
    </div>
  );
}

/** Authorized state: real fields only (no orders / revenue, which have no reliable source yet). */
function ConnectSummary({
  name,
  domain,
  authorizedAt,
  syncedProductLabel,
  boundCount,
  publishedCount,
}: {
  name: string;
  domain: string;
  authorizedAt?: string;
  syncedProductLabel: string;
  boundCount: number | null;
  publishedCount: number | null;
}) {
  return (
    <div className="mt-4 rounded-[var(--radius-control)] border border-emerald-100 bg-brand-soft px-3 py-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-3">
        <SummaryStat label="店铺" value={name} />
        <SummaryStat label="店铺域名" value={domain} />
        <SummaryStat label="授权时间" value={authorizedAt || "—"} />
        <SummaryStat label="已同步商品" value={syncedProductLabel} />
        <SummaryStat
          label="已关联货源"
          value={boundCount == null ? "读取中…" : String(boundCount)}
        />
        <SummaryStat
          label="已刊登"
          value={publishedCount == null ? "读取中…" : String(publishedCount)}
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 leading-tight">
      <p className="text-[11px] text-brand/70">{label}</p>
      <p className="truncate text-xs font-medium text-ink">{value}</p>
    </div>
  );
}
