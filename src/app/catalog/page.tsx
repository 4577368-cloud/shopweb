"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { api, ApiError } from "@/lib/api";
import type {
  CatalogRecommendation,
  PricingTemplate,
  PublishResult,
  PublishStatus,
} from "@/lib/types";

const RECOMMENDATION_LIMIT = 20;

const ROUNDING_OPTIONS: { value: string; label: string }[] = [
  { value: "HALF_UP", label: "四舍五入 (HALF_UP)" },
  { value: "CEIL", label: "向上取整 (CEIL)" },
  { value: "FLOOR", label: "向下取整 (FLOOR)" },
  { value: "CHARM_99", label: "魅力价 .99 (CHARM_99)" },
];

/** 单条上架的会话内状态：加载中 / 结果 / 错误。仅本次会话记忆，刷新即重置。 */
interface PublishCellState {
  loading: boolean;
  result?: PublishResult;
  error?: string;
}

/** 定价模板表单的可编辑字段（以字符串承载输入，保存时解析）。 */
interface TemplateForm {
  exchangeRate: string;
  multiplier: string;
  addend: string;
  roundingStrategy: string;
  decimals: string;
  sourceCurrency: string;
  targetCurrency: string;
}

function toForm(t: PricingTemplate): TemplateForm {
  return {
    exchangeRate: String(t.exchangeRate),
    multiplier: String(t.multiplier),
    addend: String(t.addend),
    roundingStrategy: t.roundingStrategy,
    decimals: String(t.decimals),
    sourceCurrency: t.sourceCurrency,
    targetCurrency: t.targetCurrency,
  };
}

function readableError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    return `请求失败（${err.status}）：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "未知错误";
}

function money(value?: number | null, currency?: string | null): string {
  if (value == null) return "—";
  const amount = value.toFixed(2);
  return currency ? `${amount} ${currency}` : amount;
}

export default function CatalogPage() {
  const { isAuthorized, shop, showToast } = useOnboarding();
  const shopName = shop.name;

  // —— 分层 loading：页面加载 / 模板保存 / 单条上架 ——
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [template, setTemplate] = useState<PricingTemplate | null>(null);
  const [baseline, setBaseline] = useState<TemplateForm | null>(null);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [recommendations, setRecommendations] = useState<
    CatalogRecommendation[]
  >([]);
  const [publishState, setPublishState] = useState<
    Record<string, PublishCellState>
  >({});

  const loadRecommendations = useCallback(async () => {
    const items = await api.getRecommendations(shopName, RECOMMENDATION_LIMIT);
    setRecommendations(items);
  }, [shopName]);

  const loadAll = useCallback(async () => {
    setPageLoading(true);
    setPageError(null);
    try {
      const [tpl, items] = await Promise.all([
        api.getPricingTemplate(shopName),
        api.getRecommendations(shopName, RECOMMENDATION_LIMIT),
      ]);
      setTemplate(tpl);
      const f = toForm(tpl);
      setForm(f);
      setBaseline(f);
      setRecommendations(items);
    } catch (err) {
      setPageError(readableError(err));
    } finally {
      setPageLoading(false);
    }
  }, [shopName]);

  useEffect(() => {
    if (!isAuthorized) return;
    void loadAll();
  }, [isAuthorized, loadAll]);

  const isDirty = useMemo(() => {
    if (!form || !baseline) return false;
    return (Object.keys(form) as (keyof TemplateForm)[]).some(
      (k) => form[k] !== baseline[k]
    );
  }, [form, baseline]);

  const patchForm = (patch: Partial<TemplateForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setFormError(null);
  };

  const handleSaveTemplate = async () => {
    if (!form || !isDirty || savingTemplate) return;

    const exchangeRate = Number(form.exchangeRate);
    const multiplier = Number(form.multiplier);
    const addend = Number(form.addend);
    const decimals = Number.parseInt(form.decimals, 10);

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setFormError("汇率必须为大于 0 的数字");
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      setFormError("倍率必须为大于 0 的数字");
      return;
    }
    if (!Number.isFinite(addend)) {
      setFormError("加价必须为数字");
      return;
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
      setFormError("小数位需为 0–4 的整数");
      return;
    }

    setSavingTemplate(true);
    setFormError(null);
    try {
      const saved = await api.upsertPricingTemplate({
        shopName,
        exchangeRate,
        multiplier,
        addend,
        roundingStrategy: form.roundingStrategy,
        decimals,
        sourceCurrency: form.sourceCurrency,
        targetCurrency: form.targetCurrency,
      });
      setTemplate(saved);
      const f = toForm(saved);
      setForm(f);
      setBaseline(f);
      // 保存成功后刷新推荐，让 estimatedSalePrice 按新模板重算。
      await loadRecommendations();
      showToast("定价模板已保存，预估售价已按新模板重算");
    } catch (err) {
      setFormError(readableError(err));
      showToast("定价模板保存失败");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handlePublish = async (item: CatalogRecommendation) => {
    const current = publishState[item.candidateId];
    if (current?.loading) return;
    if (
      !window.confirm(
        `确认将「${item.title}」以 ${money(
          item.estimatedSalePrice,
          item.targetCurrency
        )} 上架到店铺 ${shopName}？`
      )
    ) {
      return;
    }

    setPublishState((prev) => ({
      ...prev,
      [item.candidateId]: { loading: true },
    }));
    try {
      const result = await api.publishCatalogItem(shopName, item.candidateId);
      setPublishState((prev) => ({
        ...prev,
        [item.candidateId]: { loading: false, result },
      }));
      if (result.publishStatus === "PUBLISHED") {
        showToast("上架成功");
      } else if (result.publishStatus === "PUBLISHING") {
        showToast("上架进行中");
      } else {
        showToast(`上架未完成：${result.message ?? result.publishStatus}`);
      }
    } catch (err) {
      setPublishState((prev) => ({
        ...prev,
        [item.candidateId]: { loading: false, error: readableError(err) },
      }));
      showToast("上架失败");
    }
  };

  if (!isAuthorized) {
    return (
      <AppShell>
        <PageHeader
          title="离线目录上架 · 路径B"
          description="从 Tangbuy 离线目录选品，按定价模板推算售价后一键上架到 Shopify 店铺。"
          breadcrumbs={[{ label: "授权店铺", href: "/authorize" }, { label: "离线目录上架" }]}
          actions={
            <Link href="/authorize">
              <Button>去授权店铺</Button>
            </Link>
          }
        />
        <EmptyState
          title="尚未连接店铺"
          description="完成 Shopify 授权后，此处将加载可上架的货源商品与定价模板。"
          action={
            <Link href="/authorize" className="mt-1">
              <Button size="sm">去授权店铺</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="离线目录上架 · 路径B"
        description="从 Tangbuy 离线目录选品，按定价模板推算售价后一键上架到 Shopify 店铺。"
        breadcrumbs={[{ label: "工作台", href: "/" }, { label: "离线目录上架" }]}
        actions={
          <Button
            variant="secondary"
            onClick={() => void loadAll()}
            disabled={pageLoading}
          >
            {pageLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            刷新
          </Button>
        }
      />

      {pageError ? (
        <Card className="mb-3 border-red-200">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span>加载失败：{pageError}</span>
            <Button size="sm" variant="secondary" onClick={() => void loadAll()}>
              重试
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <PricingTemplateCard
        loading={pageLoading}
        template={template}
        form={form}
        isDirty={isDirty}
        saving={savingTemplate}
        error={formError}
        onPatch={patchForm}
        onSave={() => void handleSaveTemplate()}
      />

      <div className="mb-2 mt-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">推荐货源商品</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            预估售价由上方定价模板推算 · 最多展示 {RECOMMENDATION_LIMIT} 条
          </p>
        </div>
        {!pageLoading ? (
          <Badge variant="outline">{recommendations.length} 条</Badge>
        ) : null}
      </div>

      {pageLoading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : recommendations.length === 0 ? (
        <EmptyState
          title="暂无可上架的货源商品"
          description="离线目录当前为空，或后端未返回数据。"
        />
      ) : (
        <div className="space-y-2.5">
          {recommendations.map((item) => (
            <RecommendationCard
              key={item.candidateId}
              item={item}
              state={publishState[item.candidateId]}
              onPublish={() => void handlePublish(item)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function PricingTemplateCard({
  loading,
  template,
  form,
  isDirty,
  saving,
  error,
  onPatch,
  onSave,
}: {
  loading: boolean;
  template: PricingTemplate | null;
  form: TemplateForm | null;
  isDirty: boolean;
  saving: boolean;
  error: string | null;
  onPatch: (patch: Partial<TemplateForm>) => void;
  onSave: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>定价模板</CardTitle>
          <CardDescription>
            售价 = round((采购价 × 汇率 × 倍率) + 加价)。修改后保存，推荐列表预估售价会自动重算。
          </CardDescription>
        </div>
        {template ? (
          template.isDefault ? (
            <Badge variant="warning">系统默认（未保存）</Badge>
          ) : (
            <Badge variant="success">已保存</Badge>
          )
        ) : null}
      </CardHeader>
      <CardContent>
        {loading || !form ? (
          <TableSkeleton rows={2} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="汇率 (源→目标)">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.exchangeRate}
                  onChange={(e) => onPatch({ exchangeRate: e.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label="倍率">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.multiplier}
                  onChange={(e) => onPatch({ multiplier: e.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label="加价 (目标币种)">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.addend}
                  onChange={(e) => onPatch({ addend: e.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label="小数位 (0–4)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.decimals}
                  onChange={(e) => onPatch({ decimals: e.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label="取整策略">
                <Select
                  value={form.roundingStrategy}
                  onChange={(e) => onPatch({ roundingStrategy: e.target.value })}
                  disabled={saving}
                >
                  {ROUNDING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="源币种">
                <Input
                  value={form.sourceCurrency}
                  onChange={(e) =>
                    onPatch({ sourceCurrency: e.target.value.toUpperCase() })
                  }
                  disabled={saving}
                />
              </Field>
              <Field label="目标币种">
                <Input
                  value={form.targetCurrency}
                  onChange={(e) =>
                    onPatch({ targetCurrency: e.target.value.toUpperCase() })
                  }
                  disabled={saving}
                />
              </Field>
            </div>

            {error ? (
              <p className="mt-2.5 text-[11px] leading-4 text-red-600">{error}</p>
            ) : null}

            <div className="mt-3 flex items-center gap-3">
              <Button onClick={onSave} disabled={!isDirty || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "保存中…" : "保存模板"}
              </Button>
              <span className="text-[11px] text-slate-400">
                {isDirty ? "有未保存的修改" : "无修改"}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const PUBLISH_BADGE: Record<
  PublishStatus,
  { variant: "warning" | "success" | "danger" | "default"; label: string }
> = {
  PENDING: { variant: "default", label: "待上架" },
  PUBLISHING: { variant: "warning", label: "上架进行中" },
  PUBLISHED: { variant: "success", label: "已上架" },
  FAILED: { variant: "danger", label: "上架失败" },
};

function RecommendationCard({
  item,
  state,
  onPublish,
}: {
  item: CatalogRecommendation;
  state?: PublishCellState;
  onPublish: () => void;
}) {
  const result = state?.result;
  const published = result?.publishStatus === "PUBLISHED";
  const publishing = state?.loading || result?.publishStatus === "PUBLISHING";

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="grid grid-cols-[64px_1fr_180px] items-stretch gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.title}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300">
              无图
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
            {item.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-teal-800">
              预估售价 {money(item.estimatedSalePrice, item.targetCurrency)}
            </span>
            <span className="text-[11px] text-slate-500">
              采购价 {money(item.price, item.currency)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {item.supplierShop ? (
              <Badge variant="outline">{item.supplierShop}</Badge>
            ) : null}
            {item.upstreamPlatform ? (
              <Badge variant="outline">{item.upstreamPlatform}</Badge>
            ) : null}
            {item.skuAttr ? (
              <Badge variant="outline">SKU {item.skuAttr}</Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-2 border-l border-slate-100 pl-3">
          {result ? (
            <Badge variant={PUBLISH_BADGE[result.publishStatus].variant}>
              {PUBLISH_BADGE[result.publishStatus].label}
            </Badge>
          ) : state?.error ? (
            <Badge variant="danger">上架失败</Badge>
          ) : null}

          <Button
            size="sm"
            className="w-full"
            onClick={onPublish}
            disabled={publishing || published}
            variant={published ? "secondary" : "primary"}
          >
            {state?.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {published
              ? "已上架"
              : publishing
                ? "上架中…"
                : state?.error
                  ? "重试上架"
                  : "上架到店铺"}
          </Button>

          {published && result?.shopifyProductId ? (
            <p className="break-all text-[10px] leading-tight text-slate-400">
              {result.shopifyProductId}
            </p>
          ) : null}
          {state?.error ? (
            <p className="text-[10px] leading-tight text-red-500">
              {state.error}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
