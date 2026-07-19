"use client";

import Link from "next/link";
import { useEffect } from "react";
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
} from "@/components/workbench/assistant-rail";
import { InfoCard, TipCard } from "@/components/workbench/info-card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useOnboarding } from "@/context/onboarding-context";
import { api, shopifyInstallUrl } from "@/lib/api";
import type { AiPanelContent, AuthStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
// Remembers the shop the user launched OAuth for, so we can restore state after the redirect.
const SHOP_STORAGE_KEY = "tangbuy.shopDomain";

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

const preConnectTips = [
  "使用店铺管理员账号登录 Shopify",
  "确认店铺状态正常",
  "建议在网络稳定的环境下操作",
];

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

  // After the Shopify OAuth redirect the page reloads and React state resets. Re-read the shop we
  // launched install for and restore the real authorized state from the backend (Step M0-4).
  useEffect(() => {
    if (isAuthorized) return;
    if (typeof window === "undefined") return;
    const shopFromUrl = new URLSearchParams(window.location.search).get("shop");
    const savedShop =
      window.localStorage.getItem(SHOP_STORAGE_KEY) ?? shopFromUrl;
    if (!savedShop) return;
    if (shopFromUrl && !window.localStorage.getItem(SHOP_STORAGE_KEY)) {
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopFromUrl);
    }
    let cancelled = false;
    api
      .getShopStatus(savedShop)
      .then((status) => {
        if (cancelled || !status.authorized) return;
        hydrateAuthorizedShop({
          name: status.shopName ?? savedShop,
          domain: status.shopDomain ?? savedShop,
          authorizedAt: status.authorizedAt
            ? new Date(status.authorizedAt).toLocaleString("zh-CN", {
                hour12: false,
              })
            : "",
          productCount: status.productCount ?? 0,
        });
      })
      .catch(() => {
        // Offline / not configured: stay on the input screen, no toast noise on mount.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthorized, hydrateAuthorizedShop]);

  // Real Shopify OAuth: validate the shop domain, then full-page navigate to the backend install
  // endpoint (which 302s to Shopify's consent screen). No mock state is mutated here.
  const startShopifyInstall = (explicitDomain?: string) => {
    const shopDomain = (explicitDomain ?? shopDomainInput)
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
    if (!shopDomain) {
      showToast("请先输入店铺域名");
      return;
    }
    if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
      showToast("请输入正确的店铺域名，例如 your-store.myshopify.com");
      return;
    }
    try {
      const url = shopifyInstallUrl(shopDomain);
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopDomain);
      window.location.href = url;
    } catch {
      showToast("后端地址未配置（NEXT_PUBLIC_API_BASE）");
    }
  };

  const authorizing = authStatus === "authorizing";
  const canConnect = !authorizing && Boolean(shopDomainInput.trim());

  const copilot: AiPanelContent = isAuthorized
    ? {
        title: "授权已完成",
        summary: "店铺已连接。系统已开始同步商品与订单基础数据，无需手动导入。",
        bullets: [
          `当前店铺：${shop.name}`,
          `域名：${shop.domain}`,
          "下一步：确认货源匹配结果",
        ],
        nextAction: { label: "进入智能选品", href: "/products" },
      }
    : {
        title: "开始接入",
        summary:
          "Hi！我是你的 AI 助手。授权后我会在接下来的流程中为你分析店铺、推荐货源并优化利润。",
        bullets: [
          "分析店铺数据",
          "推荐优质商品",
          "匹配最优供应链",
          "优化利润和效率",
        ],
        nextAction: {
          label: authorizing
            ? "授权处理中…"
            : canConnect
              ? "连接 Shopify 店铺"
              : "等待输入域名",
          action: "connect",
          disabled: !canConnect,
          disabledReason: !shopDomainInput.trim()
            ? "请先输入店铺域名，再发起授权。"
            : authorizing
              ? "正在处理授权，请稍候。"
              : undefined,
        },
      };

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={
        <AssistantRail>
          <CopilotCard
            content={copilot}
            onNextAction={(action) => {
              if (action === "connect") startShopifyInstall();
            }}
          />
          <TipCard
            title="小贴士"
            tips={preConnectTips}
            footer={
              <Link
                href="#"
                className="font-medium text-brand-strong hover:underline"
              >
                查看连接教程 →
              </Link>
            }
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
        description="这是工作台入口。连接 Shopify 后，系统会自动同步商品与订单基础数据，无需手动导入。"
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
              <TwoStepProgress
                authorizing={authorizing}
                isAuthorized={isAuthorized}
              />

              {isAuthorized ? (
                <AuthorizedSummary
                  name={shop.name}
                  authorizedAt={shop.authorizedAt}
                  productCount={shop.productCount}
                  orderCount={shop.orderCount}
                />
              ) : (
                <div className="mt-5 space-y-4">
                  <Field
                    label="输入 Shopify 店铺域名"
                    hint="例如：northwind-home.myshopify.com"
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

                  <Button
                    className="w-full"
                    onClick={() => startShopifyInstall()}
                    disabled={!canConnect}
                  >
                    {authorizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        授权中…
                      </>
                    ) : (
                      <>
                        <Link2 className="h-4 w-4" />
                        开始连接 Shopify
                      </>
                    )}
                  </Button>
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

function TwoStepProgress({
  authorizing,
  isAuthorized,
}: {
  authorizing: boolean;
  isAuthorized: boolean;
}) {
  const step1Done = isAuthorized || authorizing;
  const step2Active = authorizing;
  const step2Done = isAuthorized;

  return (
    <div className="flex items-center gap-3">
      <StepPill index={1} label="输入店铺域名" done={step1Done} active={!step1Done} />
      <span
        className={cn(
          "h-px flex-1",
          step1Done ? "bg-brand/40" : "bg-hairline"
        )}
      />
      <StepPill
        index={2}
        label="授权并连接"
        done={step2Done}
        active={step2Active}
        loading={authorizing}
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
          done
            ? "bg-brand text-white"
            : active
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

function AuthorizedSummary({
  name,
  authorizedAt,
  productCount,
  orderCount,
}: {
  name: string;
  authorizedAt?: string;
  productCount: number;
  orderCount: number;
}) {
  return (
    <div className="mt-5 rounded-[var(--radius-control)] border border-emerald-100 bg-brand-soft px-4 py-3.5">
      <div className="flex items-center gap-2 text-sm font-medium text-brand-strong">
        <ShieldCheck className="h-4 w-4" />
        授权成功 · 数据同步中
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-4">
        <SummaryStat label="店铺" value={name} />
        <SummaryStat label="授权时间" value={authorizedAt || "—"} />
        <SummaryStat label="商品数" value={String(productCount)} />
        <SummaryStat label="近 30 天订单" value={String(orderCount)} />
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
