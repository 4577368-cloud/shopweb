"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Database,
  LineChart,
  Link2,
  Loader2,
  Lock,
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
import { InfoCard } from "@/components/workbench/info-card";
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

const safetyPoints = [
  "Shopify 官方 API 授权",
  "仅获取必要数据（只读）",
  "银行级加密传输",
  "符合 GDPR 隐私标准",
];

type Phase = "unbound" | "restoring" | "authorized";

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
    showToast,
    hydrateAuthorizedShop,
  } = useOnboarding();

  const [restoring, setRestoring] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [boundCount, setBoundCount] = useState<number | null>(null);
  const [editingDomain, setEditingDomain] = useState(false);
  const [savedShop, setSavedShop] = useState<string | null>(null);

  const loadBound = useCallback(async (shopName: string) => {
    try {
      const list = await api.listImageBindings(shopName);
      const distinct = new Set(
        list
          .filter((b) => b.bound && b.thirdPlatformItemId)
          .map((b) => b.thirdPlatformItemId)
      );
      setBoundCount(distinct.size);
    } catch {
      setBoundCount(null);
    }
  }, []);

  // Runs once: prefill the (now secondary) domain input for one-click reconnect, and restore the real
  // authorized state from the backend after the OAuth redirect (localStorage + ?shop + /status).
  // Fail-open by design: the restore spinner ALWAYS clears (in finally + a hard timeout), so a blocked
  // request (CORS/offline) or a slow backend can never strand the page — it falls back to the connect
  // screen. We intentionally do NOT gate the clear behind a cancel flag (that stranded the spinner
  // under React Strict Mode's double-invoke in dev).
  const restoreStartedRef = useRef(false);
  useEffect(() => {
    if (restoreStartedRef.current) return;
    if (typeof window === "undefined") return;
    if (isAuthorized) {
      restoreStartedRef.current = true;
      return;
    }

    const shopFromUrl = new URLSearchParams(window.location.search).get("shop");
    const stored = window.localStorage.getItem(SHOP_STORAGE_KEY);
    const shopToRestore = stored ?? shopFromUrl;
    if (shopFromUrl && !stored) {
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopFromUrl);
    }
    if (!shopToRestore) {
      restoreStartedRef.current = true;
      return;
    }

    restoreStartedRef.current = true;
    setSavedShop(shopToRestore);
    if (!shopDomainInput) setShopDomainInput(shopToRestore);

    setRestoring(true);
    // Hard timeout so a hanging/blocked request never keeps the spinner up forever.
    const timer = window.setTimeout(() => setRestoring(false), 12000);
    api
      .getShopStatus(shopToRestore)
      .then((status) => {
        if (!status.authorized) return;
        hydrateAuthorizedShop({
          name: status.shopName ?? shopToRestore,
          domain: status.shopDomain ?? shopToRestore,
          authorizedAt: fmtDate(status.authorizedAt),
          productCount: status.productCount ?? 0,
        });
      })
      .catch(() => {
        // Offline / CORS / not configured / not yet authorized: fall back to the connect screen.
      })
      .finally(() => {
        window.clearTimeout(timer);
        setRestoring(false);
      });
  }, [isAuthorized, shopDomainInput, setShopDomainInput, hydrateAuthorizedShop]);

  // Once authorized, read the real "已关联货源数" from the same source /products uses.
  useEffect(() => {
    if (!isAuthorized || boundCount !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of real bound count
    void loadBound(shop.name);
  }, [isAuthorized, boundCount, shop.name, loadBound]);

  // Re-check status + bound count so the async post-auth product sync can surface without a reload.
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const status = await api.getShopStatus(shop.domain);
      if (status.authorized) {
        hydrateAuthorizedShop({
          name: status.shopName ?? shop.name,
          domain: status.shopDomain ?? shop.domain,
          authorizedAt: fmtDate(status.authorizedAt) || (shop.authorizedAt ?? ""),
          productCount: status.productCount ?? 0,
        });
        await loadBound(status.shopName ?? shop.name);
      }
    } catch {
      showToast("刷新失败，请稍后重试");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, shop.domain, shop.name, shop.authorizedAt, hydrateAuthorizedShop, loadBound, showToast]);

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
  const phase: Phase = isAuthorized ? "authorized" : restoring ? "restoring" : "unbound";
  const trimmedDomain = shopDomainInput.trim();
  const hasPrefilledShop = Boolean(savedShop) && !editingDomain && Boolean(trimmedDomain);
  const syncing = isAuthorized && shop.productCount === 0;

  const { copilot, suggestions } = buildAssistant(phase, {
    shopName: shop.name,
    shopDomain: shop.domain,
    authorizedAt: shop.authorizedAt,
    productCount: shop.productCount,
    boundCount,
    canConnect: Boolean(trimmedDomain) && !authorizing,
    onConnect: () => startShopifyInstall(),
  });

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={
        <AssistantRail>
          <CopilotCard
            content={copilot}
            suggestions={suggestions}
            suggestionsKey={phase}
            onNextAction={(action) => {
              if (action === "connect") startShopifyInstall();
            }}
          />
          <InfoCard
            title="你的数据安全，我们保障"
            icon={<Lock className="h-3.5 w-3.5 text-brand" />}
            footer={
              <Link
                href="#"
                className="font-medium text-brand-strong hover:underline"
              >
                了解数据安全 →
              </Link>
            }
          >
            <ul className="space-y-1.5">
              {safetyPoints.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-brand" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </InfoCard>
        </AssistantRail>
      }
    >
      <WorkbenchPanel
        title="授权店铺"
        description="Shopify 授权回跳后在这里恢复接入状态并查看结果；也可直接从这里兜底连接店铺。"
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
              <h2 className="text-lg font-semibold tracking-tight text-ink">
                连接你的 Shopify 店铺
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                只需 2 步，即可开始 AI 分析并优化你的店铺
              </p>
            </div>

            <div className="px-5 py-5">
              <TwoStepProgress authorizing={authorizing} phase={phase} />

              {phase === "authorized" ? (
                <ConnectSummary
                  name={shop.name}
                  domain={shop.domain}
                  authorizedAt={shop.authorizedAt}
                  productCount={shop.productCount}
                  boundCount={boundCount}
                  syncing={syncing}
                  refreshing={refreshing}
                  onRefresh={() => void refresh()}
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
    canConnect: boolean;
    onConnect: () => void;
  }
): { copilot: AiPanelContent; suggestions: AssistantSuggestion[] } {
  const { shopName, shopDomain, authorizedAt, productCount, boundCount, canConnect } = ctx;

  if (phase === "authorized") {
    const boundText =
      boundCount != null ? `，其中 ${boundCount} 个已关联 Tangbuy 货源` : "";
    return {
      copilot: {
        title: "接入完成",
        summary: `已连接 ${shopName}（${shopDomain}）。已同步 ${productCount} 个商品${boundText}。`,
        bullets: [
          `授权时间：${authorizedAt || "—"}`,
          productCount === 0
            ? "商品同步进行中，稍后点「刷新」查看"
            : `已同步商品：${productCount} 个`,
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
          q: "商品数为什么可能是 0？",
          a: "授权后商品在后台异步同步，稍等片刻点「刷新」即可看到最新的已同步商品数。",
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
}: {
  authorizing: boolean;
  phase: Phase;
}) {
  const connecting = authorizing || phase === "restoring";
  const authorized = phase === "authorized";
  const step1Done = authorized || connecting;
  const step2Active = connecting;
  const step2Done = authorized;

  return (
    <div className="flex items-center gap-3">
      <StepPill index={1} label="选择店铺" done={step1Done} active={!step1Done} />
      <span className={cn("h-px flex-1", step1Done ? "bg-brand/40" : "bg-hairline")} />
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
  productCount,
  boundCount,
  syncing,
  refreshing,
  onRefresh,
}: {
  name: string;
  domain: string;
  authorizedAt?: string;
  productCount: number;
  boundCount: number | null;
  syncing: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-5 rounded-[var(--radius-control)] border border-emerald-100 bg-brand-soft px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-brand-strong">
          <ShieldCheck className="h-4 w-4" />
          授权成功{syncing ? " · 数据同步中" : ""}
        </div>
        <Button size="sm" variant="secondary" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          刷新
        </Button>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3">
        <SummaryStat label="店铺" value={name} />
        <SummaryStat label="店铺域名" value={domain} />
        <SummaryStat label="授权时间" value={authorizedAt || "—"} />
        <SummaryStat
          label="已同步商品"
          value={syncing ? "同步中…" : String(productCount)}
        />
        <SummaryStat
          label="已关联货源"
          value={boundCount == null ? "读取中…" : String(boundCount)}
        />
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-brand/70">{label}</p>
      <p className="mt-0.5 truncate font-medium text-ink">{value}</p>
    </div>
  );
}
