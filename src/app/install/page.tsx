"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  LayoutGrid,
  Link2,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnboarding } from "@/context/onboarding-context";
import {
  SHOP_STORAGE_KEY,
  launchShopifyInstall,
} from "@/lib/shopify-install";

import { AppLogo } from "@/components/brand/app-logo";
import { APP_FULL_NAME } from "@/lib/brand";

const trustSignals = [
  "官方 OAuth 授权",
  "只读访问",
  "不修改店铺数据",
  "加密传输",
];

// Core value points — only capabilities that already exist in the product.
const valuePoints: { icon: typeof Database; title: string; desc: string }[] = [
  {
    icon: Database,
    title: "自动同步商品",
    desc: "授权后自动拉取 Shopify 在售商品镜像，无需手动导入。",
  },
  {
    icon: Search,
    title: "AI 图搜关联货源",
    desc: "用商品主图在 Tangbuy 图搜，结合 AI 识图纠偏，自动匹配货源。",
  },
  {
    icon: LayoutGrid,
    title: "SKU 逐变体对齐",
    desc: "把 Shopify 变体按 Tangbuy 货源 SKU 矩阵自动对齐，减少人工核对。",
  },
  {
    icon: Boxes,
    title: "定价推算与上架",
    desc: "按定价模板推算售价，从 Tangbuy 商城一键上架为可售商品。",
  },
];

// Honest preview frames of the real product pages (no fabricated dashboards / fake data).
const previews: { title: string; desc: string }[] = [
  {
    title: "智能选品 · 商品卡对照",
    desc: "Shopify 在售商品与 Tangbuy 货源左右对照，支持图搜关联与 Tangbuy 商城上架。",
  },
  {
    title: "SKU 绑定 · 人眼对照确认",
    desc: "按商品折叠、变体左右对照，一眼判断 Shopify 与 Tangbuy 是否同一款。",
  },
  {
    title: "首轮自动处理 · 任务扫描",
    desc: "进入工作台前自动同步、图搜关联、对齐 SKU，真实任务进度可见。",
  },
];

const steps: { title: string; desc: string }[] = [
  { title: "连接店铺", desc: "通过 Shopify 官方 OAuth 授权，只读接入店铺基础数据。" },
  { title: "AI 匹配货源", desc: "系统自动为在售商品图搜关联 Tangbuy 货源并对齐 SKU。" },
  { title: "确认并上架", desc: "确认匹配、按定价模板推算售价，上架为可售商品。" },
];

export default function InstallPage() {
  const { showToast } = useOnboarding();
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Prefill the remembered shop so returning testers can reconnect in one click.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(SHOP_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prefill from localStorage
    if (saved) setDomain(saved);
  }, []);

  const connect = () => {
    setError(null);
    const result = launchShopifyInstall(domain);
    if (!result.ok) {
      setError(result.error ?? "无法发起授权");
      if (result.error) showToast(result.error);
    }
    // On success the browser navigates away to Shopify — nothing else to do here.
  };

  return (
    <main className="min-h-full bg-canvas">
      {/* Top bar */}
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <AppLogo variant="header" size="sm" />
            <span className="ml-0.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Developer Preview
            </span>
          </div>
          <Link
            href="/authorize"
            className="text-xs font-medium text-ink-muted hover:text-ink"
          >
            已授权？进入工作台 →
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-8 sm:py-12">
        {/* Hero */}
        <section className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-muted">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Shopify × Tangbuy Smart Match
            </span>
            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
              连接 Shopify，
              <br />
              让 AI 自动为你的商品匹配 Tangbuy 货源
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
              授权后自动同步在售商品、图搜关联货源、逐变体对齐 SKU，并按定价模板推算售价上架，
              尽量减少人工干预。
            </p>

            {/* Domain + primary CTA */}
            <div className="mt-6 max-w-md space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") connect();
                    }}
                    placeholder="your-store.myshopify.com"
                    className="pr-9"
                    aria-label="Shopify 店铺域名"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                </div>
                <Button className="shrink-0 sm:w-auto" onClick={connect}>
                  <Link2 className="h-4 w-4" />
                  连接 Shopify
                </Button>
              </div>
              {error ? (
                <p className="text-[11px] leading-4 text-red-600">{error}</p>
              ) : (
                <p className="text-[11px] leading-4 text-ink-subtle">
                  下一步将前往 Shopify 官方页面完成授权，授权为只读、可随时移除。
                </p>
              )}
            </div>

            {/* Trust strip */}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
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
          </div>

          {/* Hero preview frame (honest product preview, no fake data) */}
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-card">
            <BrowserFrame label="app · 智能选品">
              <div className="grid gap-2.5 p-3 sm:grid-cols-2">
                {valuePoints.slice(0, 2).map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="rounded-[var(--radius-control)] border border-hairline bg-canvas px-3 py-3"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <p className="mt-2 text-xs font-medium text-ink">{title}</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-ink-muted">{desc}</p>
                  </div>
                ))}
              </div>
            </BrowserFrame>
          </div>
        </section>

        {/* Core value points */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-ink">核心能力</h2>
          <p className="mt-0.5 text-xs text-ink-muted">以下均为当前已实现的功能。</p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {valuePoints.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-4 shadow-card"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-3 text-sm font-medium text-ink">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-muted">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Product previews */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-ink">产品页面预览</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            以下为产品真实功能页面的说明预览。
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {previews.map((p) => (
              <BrowserFrame key={p.title} label={p.title}>
                <div className="p-3">
                  <p className="text-xs font-medium text-ink">{p.title}</p>
                  <p className="mt-1 text-[11px] leading-4 text-ink-muted">{p.desc}</p>
                </div>
              </BrowserFrame>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-ink">如何运作</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {steps.map((s, idx) => (
              <div
                key={s.title}
                className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-4 shadow-card"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">
                  {idx + 1}
                </span>
                <p className="mt-2.5 text-sm font-medium text-ink">{s.title}</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-muted">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Developer preview notice */}
        <section className="mt-10 rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-4 py-4">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-900">开发测试说明</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                本应用目前处于开发测试阶段，<strong>尚未在 Shopify App Store 正式上架</strong>，
                仅面向测试店铺开放。授权通过 Shopify 官方 OAuth 完成，仅只读读取商品、库存、订单等
                基础数据用于分析与货源匹配，不会修改或删除你的店铺数据。
              </p>
            </div>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="mt-10 flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-emerald-100 bg-brand-soft px-5 py-8 text-center">
          <h3 className="text-lg font-semibold tracking-tight text-ink">
            准备好连接你的 Shopify 店铺了吗？
          </h3>
          <p className="max-w-md text-xs leading-5 text-ink-muted">
            输入店铺域名即可通过 Shopify 官方授权接入，1 分钟内完成。
          </p>
          <div className="mt-1 flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") connect();
                }}
                placeholder="your-store.myshopify.com"
                className="pr-9 bg-surface"
                aria-label="Shopify 店铺域名"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-subtle">
                <ShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <Button className="shrink-0" onClick={connect}>
              连接 Shopify
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {trustSignals.map((signal) => (
              <li
                key={signal}
                className="inline-flex items-center gap-1 text-[11px] text-ink-muted"
              >
                <CheckCircle2 className="h-3 w-3 text-brand" />
                {signal}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-10 border-t border-hairline pt-5 text-center text-[11px] text-ink-subtle">
          {APP_FULL_NAME} — Developer Preview。仅供测试店铺接入，非 Shopify 官方商店页面。
        </footer>
      </div>
    </main>
  );
}

/** A neutral browser-window chrome for honest product previews (no fake data inside). */
function BrowserFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-canvas">
      <div className="flex items-center gap-1.5 border-b border-hairline bg-surface px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        <span className="ml-2 truncate text-[10px] text-ink-subtle">{label}</span>
      </div>
      {children}
    </div>
  );
}
