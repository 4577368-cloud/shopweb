"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Coins, Loader2, RefreshCw } from "lucide-react";
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
import { api, readableError } from "@/lib/api";
import {
  fetchRecommendations,
  fetchRecommendationsCount,
  repriceRecommendations,
} from "@/lib/catalog-recommendations";
import {
  isMallGatewayConfigured,
  toPublishSnapshot,
} from "@/lib/tangbuy-mall-gateway";
import type {
  CatalogRecommendation,
  PricingTemplate,
  PublishResult,
  PublishStatus,
} from "@/lib/types";

const PAGE_SIZE = 30;

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

function money(value?: number | null, currency?: string | null): string {
  if (value == null) return "—";
  const amount = value.toFixed(2);
  return currency ? `${amount} ${currency}` : amount;
}

export function CatalogPublishPanel({ onActivity }: { onActivity?: () => void }) {
  const { shop, showToast } = useOnboarding();
  const shopName = shop.name;

  // —— 分层 loading：页面加载 / 模板保存 / 单条上架 ——
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [template, setTemplate] = useState<PricingTemplate | null>(null);
  const [baseline, setBaseline] = useState<TemplateForm | null>(null);
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Pricing editor is demoted to a weak, collapsed-by-default entry (no longer a main-content card).
  const [showPricing, setShowPricing] = useState(false);
  const [recommendations, setRecommendations] = useState<
    CatalogRecommendation[]
  >([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [publishState, setPublishState] = useState<
    Record<string, PublishCellState>
  >({});

  // Re-fetch every page currently on screen so estimatedSalePrice reflects a just-saved template,
  // without dropping the user's scroll depth.
  const loadRecommendations = useCallback(async () => {
    if (!template) return;
    if (isMallGatewayConfigured()) {
      const pages = Math.max(1, Math.ceil(recommendations.length / PAGE_SIZE));
      const collected: CatalogRecommendation[] = [];
      for (let i = 0; i < pages; i++) {
        collected.push(
          ...(await fetchRecommendations(
            shopName,
            PAGE_SIZE,
            i * PAGE_SIZE,
            template
          ))
        );
      }
      setRecommendations(collected);
      return;
    }
    const pages = Math.max(1, Math.ceil(recommendations.length / PAGE_SIZE));
    const collected: CatalogRecommendation[] = [];
    for (let i = 0; i < pages; i++) {
      collected.push(
        ...(await fetchRecommendations(shopName, PAGE_SIZE, i * PAGE_SIZE))
      );
    }
    setRecommendations(collected);
  }, [shopName, recommendations.length, template]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await fetchRecommendations(
        shopName,
        PAGE_SIZE,
        recommendations.length,
        template
      );
      setRecommendations((prev) => [...prev, ...next]);
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setLoadingMore(false);
    }
  }, [shopName, recommendations.length, loadingMore, template]);

  const loadAll = useCallback(async () => {
    setPageLoading(true);
    setPageError(null);
    try {
      const tpl = await api.getPricingTemplate(shopName);
      const [items, cnt] = await Promise.all([
        fetchRecommendations(shopName, PAGE_SIZE, 0, tpl),
        fetchRecommendationsCount(),
      ]);
      setTemplate(tpl);
      const f = toForm(tpl);
      setForm(f);
      setBaseline(f);
      setRecommendations(items);
      setTotal(cnt || items.length);
    } catch (err) {
      setPageError(readableError(err));
    } finally {
      setPageLoading(false);
    }
  }, [shopName]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
      if (isMallGatewayConfigured()) {
        setRecommendations((prev) => repriceRecommendations(prev, saved));
      } else {
        await loadRecommendations();
      }
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
      const result = await api.publishCatalogItem(
        shopName,
        item.candidateId,
        toPublishSnapshot(item)
      );
      setPublishState((prev) => ({
        ...prev,
        [item.candidateId]: { loading: false, result },
      }));
      onActivity?.();
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

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-ink-subtle">
          从 Tangbuy 商城选品，按定价模板推算售价后一键上架为可售商品。
          {isMallGatewayConfigured() ? " · 目录由浏览器直连 Tangbuy 网关加载" : ""}
        </p>
        <Button
          variant="secondary"
          size="sm"
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
      </div>

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

      {showPricing ? (
        <div>
          <div className="mb-1.5 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPricing(false)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink"
            >
              收起定价 <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
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
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowPricing(true)}
          className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-hairline bg-surface px-3.5 py-2.5 text-left shadow-card transition-colors hover:border-hairline-strong"
        >
          <span className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
            <Coins className="h-4 w-4 shrink-0 text-brand" />
            {template ? (
              <span className="truncate">
                定价策略 · 采购价（{template.sourceCurrency}）÷ 汇率 {template.exchangeRate} 换算为{" "}
                {template.targetCurrency} · 倍率 ×{template.multiplier}
                {template.isDefault ? " · 系统默认" : ""}
              </span>
            ) : (
              <span>定价策略 · 影响上架到 Shopify 的售价</span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-strong">
            调整定价 <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      <div className="mb-2 mt-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink">Tangbuy 商城 · 可上架</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">
            预估售价由上方定价模板推算 · 已加载 {recommendations.length}/{total} 条
          </p>
        </div>
        {!pageLoading ? (
          <Badge variant="outline">{total} 条</Badge>
        ) : null}
      </div>

      {pageLoading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : recommendations.length === 0 ? (
        <EmptyState
          title="暂无可上架的货源商品"
          description="Tangbuy 商城当前为空，或后端未返回数据。"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((item) => (
              <RecommendationCard
                key={item.candidateId}
                item={item}
                state={publishState[item.candidateId]}
                onPublish={() => void handlePublish(item)}
              />
            ))}
          </div>
          {recommendations.length < total ? (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore
                  ? "加载中…"
                  : `加载更多（还有 ${total - recommendations.length} 条）`}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
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
            售价 = round((采购价 ÷ 汇率 × 倍率) + 加价)。汇率表示「多少源币种 = 1 目标币种」（如 6.5 CNY = 1 USD），采购价会按除法换算为目标币种后再乘倍率、加加价；该规则将决定上架到 Shopify 的售价。修改保存后，预估售价会自动重算。
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
              <span className="text-[11px] text-ink-subtle">
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
  const [imgError, setImgError] = useState(false);

  return (
    <article className="flex flex-col rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-card">
      <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
        {item.imageUrl && !imgError ? (
          <Image
            src={item.imageUrl}
            alt={item.title}
            fill
            sizes="240px"
            className="object-cover"
            unoptimized
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-subtle">
            {item.imageUrl ? "货源图暂不可用" : "无图"}
          </div>
        )}
        {result ? (
          <div className="absolute left-2 top-2">
            <Badge variant={PUBLISH_BADGE[result.publishStatus].variant}>
              {PUBLISH_BADGE[result.publishStatus].label}
            </Badge>
          </div>
        ) : state?.error ? (
          <div className="absolute left-2 top-2">
            <Badge variant="danger">上架失败</Badge>
          </div>
        ) : null}
      </div>

      <h3 className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-xs font-semibold leading-5 text-ink">
        {item.title}
      </h3>

      <div className="mt-1.5">
        <p className="text-sm font-semibold text-brand-strong">
          预估售价 {money(item.estimatedSalePrice, item.targetCurrency)}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-subtle">
          采购价 {money(item.price, item.currency)}
        </p>
      </div>

      {item.supplierShop || item.upstreamPlatform || item.skuAttr ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.supplierShop ? (
            <Badge variant="outline">{item.supplierShop}</Badge>
          ) : null}
          {item.upstreamPlatform ? (
            <Badge variant="outline">{item.upstreamPlatform}</Badge>
          ) : null}
          {item.skuAttr ? <Badge variant="outline">SKU {item.skuAttr}</Badge> : null}
        </div>
      ) : null}

      <div className="mt-auto pt-3">
        <Button
          size="sm"
          className="w-full"
          onClick={onPublish}
          disabled={publishing || published}
          variant={published ? "secondary" : "primary"}
        >
          {state?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {published
            ? "已上架"
            : publishing
              ? "上架中…"
              : state?.error
                ? "重试上架"
                : "上架到店铺"}
        </Button>
        {published && result?.shopifyProductId ? (
          <p className="mt-1.5 break-all text-[10px] leading-tight text-ink-subtle">
            {result.shopifyProductId}
          </p>
        ) : null}
        {state?.error ? (
          <p className="mt-1.5 text-[10px] leading-tight text-red-500">{state.error}</p>
        ) : null}
      </div>
    </article>
  );
}
