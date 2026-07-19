"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  Link2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthStatusBadge } from "@/components/ui/status-badge";
import { useOnboarding } from "@/context/onboarding-context";
import { api, shopifyInstallUrl } from "@/lib/api";
import type { AiPanelContent, AuthStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
// Remembers the shop the user launched OAuth for, so we can restore state after the redirect.
const SHOP_STORAGE_KEY = "tangbuy.shopDomain";

const flowSteps: {
  key: AuthStatus | "done";
  title: string;
  detail: string;
}[] = [
  {
    key: "waiting_input",
    title: "输入店铺域名",
    detail: "填写 your-store.myshopify.com",
  },
  {
    key: "ready_to_authorize",
    title: "发起 Shopify 授权",
    detail: "跳转授权页，授予商品与订单权限",
  },
  {
    key: "authorizing",
    title: "授权处理中",
    detail: "正在验证并建立店铺连接",
  },
  {
    key: "authorized",
    title: "授权完成",
    detail: "自动同步商品与订单基础数据",
  },
];

function flowIndex(status: AuthStatus): number {
  if (status === "waiting_input") return 0;
  if (status === "ready_to_authorize") return 1;
  if (status === "authorizing") return 2;
  if (status === "authorized") return 3;
  if (status === "error") return 1;
  return 0;
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

  const activeIndex = flowIndex(authStatus);

  // After the Shopify OAuth redirect the page reloads and React state resets. Re-read the shop we
  // launched install for and restore the real authorized state from the backend (Step M0-4).
  useEffect(() => {
    if (isAuthorized) return;
    if (typeof window === "undefined") return;
    // Prefer the shop we saved before launching install; fall back to the ?shop= param the
    // backend appends when it redirects back here after a successful OAuth callback.
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

  // Real Shopify OAuth: validate the shop domain, then full-page navigate to the backend
  // install endpoint (which 302s to Shopify's consent screen). No mock state is mutated here.
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

  const ai: AiPanelContent = useMemo(() => {
    if (isAuthorized) {
      return {
        title: "授权已完成",
        summary:
          "店铺已连接。系统已开始同步商品与订单基础数据，无需手动导入。",
        bullets: [
          `当前店铺：${shop.name}`,
          `域名：${shop.domain}`,
          "下一步：确认货源匹配结果",
        ],
        nextAction: {
          label: "进入智能选品",
          href: "/products",
        },
      };
    }
    return {
      title: "开始接入",
      summary:
        "授权后系统会自动同步商品与订单基础数据，无需手动导入表格或 CSV。",
      bullets: [
        "权限范围：商品读写、订单读写、履约回传",
        "授权完成后立即开始商品分析与图搜匹配",
        "可随时在店铺设置中断开连接",
      ],
      nextAction: {
        label:
          authStatus === "authorizing"
            ? "授权处理中…"
            : shopDomainInput.trim()
              ? "连接 Shopify 店铺"
              : "等待输入域名",
        action: "connect",
        disabled:
          authStatus === "authorizing" || !shopDomainInput.trim(),
        disabledReason: !shopDomainInput.trim()
          ? "请先输入店铺域名，再发起授权。"
          : authStatus === "authorizing"
            ? "正在处理授权，请稍候。"
            : undefined,
      },
      alerts:
        authStatus === "error"
          ? [
              {
                id: "auth-error",
                text: "授权失败，请检查域名后重试。",
              },
            ]
          : undefined,
    };
  }, [authStatus, isAuthorized, shop, shopDomainInput]);

  return (
    <AppShell
      ai={ai}
      onNextAction={(action) => {
        if (action === "connect") startShopifyInstall();
      }}
    >
      <PageHeader
        title="授权店铺"
        description="这是工作台入口。连接 Shopify 后，系统自动同步商品与订单基础数据，无需手动导入。"
        breadcrumbs={[{ label: "授权店铺" }]}
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
            <Button
              onClick={() => startShopifyInstall()}
              disabled={
                authStatus === "authorizing" || !shopDomainInput.trim()
              }
            >
              {authStatus === "authorizing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  授权中…
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  连接 Shopify 店铺
                </>
              )}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-[1.25fr_0.75fr] gap-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>连接 Shopify 店铺</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
                单主流程：输入域名 → 发起授权 → 自动同步数据
              </p>
            </div>
            <AuthStatusBadge status={authStatus} />
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="店铺域名"
              hint="示例：northwind-home.myshopify.com"
            >
              <Input
                value={shopDomainInput}
                onChange={(e) => setShopDomainInput(e.target.value)}
                placeholder="your-store.myshopify.com"
                disabled={authStatus === "authorizing"}
              />
            </Field>

            <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-medium text-slate-700">授权后将自动</p>
              <ul className="mt-1.5 space-y-1 text-[11px] text-slate-500">
                <li>· 同步商品列表与 variant 基础信息</li>
                <li>· 同步近 30 天订单用于物流预估</li>
                <li>· 启动图搜与标题匹配，生成货源候选</li>
              </ul>
            </div>

            {isAuthorized ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                  <Shield className="h-4 w-4" />
                  授权成功 · 数据同步中
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-emerald-900/80">
                  <div>
                    <p className="text-emerald-700/70">店铺</p>
                    <p className="font-medium">{shop.name}</p>
                  </div>
                  <div>
                    <p className="text-emerald-700/70">授权时间</p>
                    <p className="font-medium">{shop.authorizedAt}</p>
                  </div>
                  <div>
                    <p className="text-emerald-700/70">商品数</p>
                    <p className="font-medium">{shop.productCount}</p>
                  </div>
                  <div>
                    <p className="text-emerald-700/70">近 30 天订单</p>
                    <p className="font-medium">{shop.orderCount}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>授权进度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {flowSteps.map((step, index) => {
              const done = index < activeIndex || isAuthorized;
              const current = index === activeIndex && !isAuthorized
                ? true
                : isAuthorized && index === 3;
              const pending = index > activeIndex && !isAuthorized;

              return (
                <div
                  key={step.key}
                  className={cn(
                    "relative flex gap-3 border-l-2 py-3 pl-3 first:pt-0 last:pb-0",
                    done || current
                      ? "border-teal-600"
                      : "border-slate-200"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {done && !current ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : current ? (
                      authStatus === "authorizing" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
                      ) : (
                        <Circle className="h-4 w-4 fill-teal-600 text-teal-600" />
                      )
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300" />
                    )}
                  </div>
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium",
                        pending ? "text-slate-400" : "text-slate-800"
                      )}
                    >
                      {step.title}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-xs",
                        pending ? "text-slate-400" : "text-slate-500"
                      )}
                    >
                      {step.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
