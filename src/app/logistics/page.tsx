"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { StickyActionBar } from "@/components/workbench/sticky-action-bar";
import { Button } from "@/components/ui/button";
import { LogisticsAiPanel } from "@/components/logistics/logistics-ai-panel";
import {
  LogisticsDecisionList,
  type LogisticsFocusTarget,
} from "@/components/logistics/logistics-decision-list";
import { LogisticsSummaryHeader } from "@/components/logistics/logistics-summary-header";
import { LogisticsTemplateDrawer } from "@/components/logistics/logistics-template-drawer";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError, type LogisticsAcceptDecisionRequest, type LogisticsEstimateResult } from "@/lib/api";
import type { LogisticsFilterMode } from "@/lib/logistics/display";
import {
  buildEstimateParams,
  listTemplateCountryCodes,
  resolveQuoteMarketCode,
} from "@/lib/logistics/template-params";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
  LogisticsTypeCode,
  PricingTemplate,
  VariantLogisticsDecision,
} from "@/lib/types";

const BREADCRUMBS = [
  { label: "工作台", href: "/" },
  { label: "SKU 对齐", href: "/sku-align" },
  { label: "物流选择" },
];

const DEFAULT_TEMPLATE = (shopName: string): LogisticsTemplate => ({
  id: "default",
  shopName,
  name: "默认模板",
  packaging: "MINIMAL",
  speedPreference: "BALANCED",
  markets: [{ marketGroupId: "north_america", countryCodes: ["US"] }],
  isActive: true,
});

function LogisticsContent() {
  const router = useRouter();
  const { shop, isAuthorized, saveLogistics, showToast, skuReadyForNext } =
    useOnboarding();
  const shopName = shop.name;
  const wb = useWorkbenchPage("logistics");

  const [analysis, setAnalysis] = useState<LogisticsAnalysis | null>(null);
  const [templates, setTemplates] = useState<LogisticsTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<LogisticsTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [filterMode, setFilterMode] = useState<LogisticsFilterMode>("issues");
  const [quoteResults, setQuoteResults] = useState<
    Map<string, LogisticsEstimateResult>
  >(new Map());
  const [quoting, setQuoting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [focusTarget, setFocusTarget] = useState<LogisticsFocusTarget | null>(
    null
  );
  const [quoteMarketCode, setQuoteMarketCode] = useState<string | null>(null);
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(null);

  const templateScopeKey = useMemo(() => {
    if (!activeTemplate) return "";
    return [
      activeTemplate.id,
      activeTemplate.speedPreference,
      JSON.stringify(activeTemplate.markets ?? []),
    ].join("|");
  }, [activeTemplate]);

  useEffect(() => {
    setQuoteMarketCode(resolveQuoteMarketCode(activeTemplate, null));
    setQuoteResults(new Map());
  }, [templateScopeKey]);

  const load = useCallback(
    async (forceClassify: boolean) => {
      setLoading(true);
      setError(null);
      try {
        setClassifying(true);
        const [a, ts, pt] = await Promise.all([
          forceClassify
            ? api.analyzeLogistics(shopName, true)
            : api.analyzeLogistics(shopName, false),
          api.listLogisticsTemplates(shopName),
          api.getPricingTemplate(shopName),
        ]);
        setAnalysis(a);
        setTemplates(ts);
        setPricingTemplate(pt);
        if (ts.length > 0) {
          setActiveTemplate(ts[0]);
        } else {
          setActiveTemplate(DEFAULT_TEMPLATE(shopName));
        }
      } catch (err) {
        setError(readableError(err));
        const ts = await api.listLogisticsTemplates(shopName).catch(() => []);
        setTemplates(ts);
        setActiveTemplate(ts.length > 0 ? ts[0] : DEFAULT_TEMPLATE(shopName));
      } finally {
        setClassifying(false);
        setLoading(false);
      }
    },
    [shopName]
  );

  useEffect(() => {
    if (!isAuthorized) return;
    void load(false);
  }, [isAuthorized, load]);

  const handleCorrect = async (itemId: string, type: LogisticsTypeCode) => {
    if (correctingId) return;
    setCorrectingId(itemId);
    try {
      const updated = await api.correctLogisticsType(shopName, itemId, type);
      setAnalysis((prev) => {
        if (!prev) return prev;
        const productProfiles = prev.productProfiles.map((p) =>
          p.thirdPlatformItemId === itemId ? updated : p
        );

        const totalVariants = productProfiles.reduce(
          (sum, p) => sum + p.totalVariants,
          0
        );
        const decisionStatusCounts: Record<LogisticsDecisionStatus, number> = {
          pending_sku: 0,
          pending_postal_meta: 0,
          ready_for_quote: 0,
          restricted: 0,
          needs_review: 0,
        };
        for (const p of productProfiles) {
          for (const [status, count] of Object.entries(p.decisionStatusCounts)) {
            decisionStatusCounts[status as LogisticsDecisionStatus] += count;
          }
        }

        const highRiskTypes = productProfiles
          .map((p) => p.dominantLogisticsType)
          .filter(
            (t, i, arr) =>
              (t === "BATTERY_MAGNETIC" || t === "FOOD" || t === "BLADE") &&
              arr.indexOf(t) === i
          );

        return {
          ...prev,
          productProfiles,
          totalVariants,
          decisionStatusCounts,
          highRiskTypes,
        };
      });
      showToast("已修正物流类型");
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setCorrectingId(null);
    }
  };

  const handleSaveTemplate = async (
    upsertData: {
      shopName: string;
      name?: string;
      packaging: string;
      speedPreference: string;
      markets: { marketGroupId: string; countryCodes: string[] }[];
    },
    id?: string
  ) => {
    setSaving(true);
    try {
      const saved = await api.upsertLogisticsTemplate(upsertData as any, id);
      setTemplates((prev) => {
        if (id) {
          return prev.map((t) => (t.id === id ? saved : t));
        }
        return [saved, ...prev];
      });
      setActiveTemplate(saved);
      showToast("物流模板已保存");
      return saved;
    } catch (err) {
      showToast(readableError(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.deleteLogisticsTemplate(shopName, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeTemplate?.id === id) {
        const remaining = templates.filter((t) => t.id !== id);
        setActiveTemplate(
          remaining.length > 0 ? remaining[0] : DEFAULT_TEMPLATE(shopName)
        );
      }
      showToast("模板已删除");
    } catch (err) {
      showToast(readableError(err));
    }
  };

  const handleSelectTemplate = (template: LogisticsTemplate) => {
    setActiveTemplate(template);
    setQuoteMarketCode(resolveQuoteMarketCode(template, null));
    setShowDrawer(false);
  };

  const handleSave = async (goSync = false) => {
    if (!activeTemplate || saving) return;
    const codes = codesFromSelections(activeTemplate.markets);
    if (codes.length === 0) {
      showToast("请先配置物流模板并选择销售国家");
      return;
    }
    saveLogistics();
    if (goSync) router.push("/sync");
  };

  const collectReadyVariants = useCallback(() => {
    const variants: Array<{
      thirdPlatformSkuId: string;
      tangbuySkuId: string;
      tangbuyGoodsId: string;
      incrementList: string[];
      quantity: number;
    }> = [];
    for (const p of analysis?.productProfiles ?? []) {
      for (const v of p.variantDecisions ?? []) {
        if (
          v.decisionStatus === "ready_for_quote" &&
          v.tangbuySkuId &&
          v.tangbuyGoodsId
        ) {
          variants.push({
            thirdPlatformSkuId: v.thirdPlatformSkuId,
            tangbuySkuId: v.tangbuySkuId,
            tangbuyGoodsId: v.tangbuyGoodsId,
            incrementList: [],
            quantity: 1,
          });
        }
      }
    }
    return variants;
  }, [analysis?.productProfiles]);

  const handleFetchQuotes = async () => {
    const variants = collectReadyVariants();
    if (quoting || variants.length === 0) return;

    const params = buildEstimateParams(activeTemplate, quoteMarketCode);
    if (!params) {
      showToast("请先在模板中配置销售市场");
      return;
    }

    setQuoting(true);
    try {
      const response = await api.estimateLogistics({
        shopName,
        countryCode: params.countryCode,
        shippingOption: params.shippingOption,
        packaging: params.packaging,
        variants,
        needOtherLine: true,
        needMeasure: true,
      });
      const resultsMap = new Map<string, LogisticsEstimateResult>();
      for (const r of response.results) {
        resultsMap.set(r.thirdPlatformSkuId, r);
      }
      setQuoteResults(resultsMap);
      showToast(
        `已拉取 ${resultsMap.size} 条线路（${params.countryCode} · 时效${params.shippingOption}）`
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setQuoting(false);
    }
  };

  const buildQuotesPayload = useCallback(() => {
    const quotes: LogisticsAcceptDecisionRequest["quotes"] = {};
    for (const [skuId, result] of quoteResults.entries()) {
      quotes[skuId] = {
        recommendedLine: result.recommendedLine,
        alternativeLines: result.alternativeLines,
        quoteStatus: result.quoteStatus,
      };
    }
    return quotes;
  }, [quoteResults]);

  const handleAcceptAllReady = async () => {
    if (accepting) return;
    setAccepting(true);
    try {
      const result = await api.acceptLogisticsDecision({
        shopName,
        targetScope: "ALL_READY",
        quotes: buildQuotesPayload(),
      });
      setAnalysis(result.analysis);
      showToast(
        result.acceptedCount > 0
          ? `已接受 ${result.acceptedCount} 条可报价决策`
          : "没有可接受的可报价项"
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleAcceptAi = async (
    variant: VariantLogisticsDecision,
    _productId: string
  ) => {
    if (accepting) return;
    setAccepting(true);
    try {
      const quote = quoteResults.get(variant.thirdPlatformSkuId);
      const result = await api.acceptLogisticsDecision({
        shopName,
        targetScope: "VARIANTS",
        variantIds: [variant.thirdPlatformSkuId],
        quotes: quote
          ? {
              [variant.thirdPlatformSkuId]: {
                recommendedLine: quote.recommendedLine,
                alternativeLines: quote.alternativeLines,
                quoteStatus: quote.quoteStatus,
              },
            }
          : undefined,
      });
      setAnalysis(result.analysis);
      showToast(
        result.acceptedCount > 0 ? "已接受 AI 决策" : "该规格暂不可接受"
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setAccepting(false);
    }
  };

  const handleFocusStatus = (status: LogisticsDecisionStatus) => {
    setFilterMode("issues");
    setFocusTarget({ status });
  };

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<StepSidebar />}
        rail={
          <AssistantRail
            assistantContent={
              <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs text-ink-subtle">
                请先完成店铺授权。
              </div>
            }
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title="物流选择"
          breadcrumbs={BREADCRUMBS}
          {...wb.panelProps}
        >
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-6 text-sm text-ink-muted">
            请先完成店铺授权。
            <Link
              href="/authorize"
              className="ml-2 text-brand-strong hover:underline"
            >
              去授权
            </Link>
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <LogisticsAiPanel
              decisionStatusCounts={analysis?.decisionStatusCounts}
              highRiskTypes={analysis?.highRiskTypes}
              skuReadyForNext={skuReadyForNext}
              quoting={quoting}
              accepting={accepting}
              saving={saving}
              onFocusStatus={handleFocusStatus}
              onAcceptAllReady={() => void handleAcceptAllReady()}
              onFetchQuotes={() => void handleFetchQuotes()}
              onSaveSync={() => void handleSave(true)}
            />
          }
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title="物流选择"
        breadcrumbs={BREADCRUMBS}
        {...wb.panelProps}
        footer={
          <StickyActionBar
            info={
              analysis
                ? `基于 ${analysis.analyzedCount} 个已关联商品`
                : "物流决策工作台"
            }
          >
            <Button
              variant="secondary"
              onClick={() => router.push("/sku-align")}
            >
              返回 SKU 对齐
            </Button>
            <Button onClick={() => void handleSave(true)} disabled={saving}>
              {saving ? "保存中…" : "保存并进入同步"}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </StickyActionBar>
        }
      >
        <div className="space-y-3">
          <LogisticsSummaryHeader
            analysis={analysis}
            templates={templates}
            activeTemplate={activeTemplate}
            filterMode={filterMode}
            onFilterModeChange={setFilterMode}
            onSelectTemplate={setActiveTemplate}
            onAddTemplate={() => {
              setActiveTemplate(null);
              setShowDrawer(true);
            }}
            onOpenTemplateConfig={() => setShowDrawer(true)}
            onReclassify={() => void load(true)}
            reclassifying={loading || classifying}
            quoteMarketCode={quoteMarketCode}
            onQuoteMarketChange={(code) => {
              if (listTemplateCountryCodes(activeTemplate).includes(code)) {
                setQuoteMarketCode(code);
                setQuoteResults(new Map());
              }
            }}
          />

          {loading && !analysis ? (
            <div className="flex items-center gap-2 py-12 text-sm text-ink-subtle">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在生成物流决策…
            </div>
          ) : error && !analysis ? (
            <div className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
              {error}
              <Button
                size="sm"
                variant="secondary"
                className="ml-3"
                onClick={() => void load(false)}
              >
                重试
              </Button>
            </div>
          ) : analysis ? (
            <LogisticsDecisionList
              analysis={analysis}
              filterMode={filterMode}
              quoteResults={quoteResults}
              correctingId={correctingId}
              focusTarget={focusTarget}
              onCorrect={(id, type) => void handleCorrect(id, type)}
              onAcceptAi={(v, pid) => void handleAcceptAi(v, pid)}
              accepting={accepting}
              onClearFocus={() => setFocusTarget(null)}
            />
          ) : null}
        </div>
      </WorkbenchPanel>

      {showDrawer ? (
        <LogisticsTemplateDrawer
          templates={templates}
          activeTemplate={activeTemplate}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onSelect={handleSelectTemplate}
          onClose={() => setShowDrawer(false)}
        />
      ) : null}
    </WorkbenchShell>
  );
}

export default function LogisticsPage() {
  return <LogisticsContent />;
}
