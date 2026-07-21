"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import {
  AssistantRail,
  CopilotCard,
} from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { StickyActionBar } from "@/components/workbench/sticky-action-bar";
import { Button } from "@/components/ui/button";
import { LogisticsTypeSummary } from "@/components/logistics/logistics-type-summary";
import { LogisticsTemplateForm } from "@/components/logistics/logistics-template-form";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import { countryLabel } from "@/lib/logistics/markets";
import type {
  AiPanelContent,
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
  LogisticsTypeCode,
} from "@/lib/types";

const BREADCRUMBS = [
  { label: "工作台", href: "/" },
  { label: "SKU 对齐", href: "/sku-align" },
  { label: "物流选择" },
];

const DEFAULT_TEMPLATE = (shopName: string): LogisticsTemplate => ({
  shopName,
  packaging: "MINIMAL",
  speedPreference: "BALANCED",
  markets: [{ marketGroupId: "north_america", countryCodes: ["US"] }],
  defaultTemplate: true,
});

/**
 * Logistics Phase 1: reuse bindings already persisted from 选品 / SKU 对齐.
 * No product re-sync / re-read scan — only classify types + configure the strategy template.
 */
function LogisticsContent() {
  const router = useRouter();
  const { shop, isAuthorized, saveLogistics, showToast, skuReadyForNext } =
    useOnboarding();
  const shopName = shop.name;
  const wb = useWorkbenchPage("logistics");

  const [analysis, setAnalysis] = useState<LogisticsAnalysis | null>(null);
  const [template, setTemplate] = useState<LogisticsTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(
    async (forceClassify: boolean) => {
      setLoading(true);
      setError(null);
      try {
        setClassifying(true);
        // Uses existing shop_product_binding + product mirror — does not pull Shopify again.
        const [a, t] = await Promise.all([
          forceClassify
            ? api.analyzeLogistics(shopName, true)
            : api.analyzeLogistics(shopName, false),
          api.getLogisticsTemplate(shopName),
        ]);
        setAnalysis(a);
        setTemplate(t);
      } catch (err) {
        setError(readableError(err));
        setTemplate((prev) => prev ?? DEFAULT_TEMPLATE(shopName));
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

        // 重新计算全局统计
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

  const handleSave = async (goSync = false) => {
    if (!template || saving) return;
    const codes = codesFromSelections(template.markets);
    if (codes.length === 0) {
      setSaveError("请至少选择一个销售国家");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.upsertLogisticsTemplate({
        shopName,
        packaging: template.packaging,
        speedPreference: template.speedPreference,
        markets: template.markets,
      });
      setTemplate(saved);
      saveLogistics();
      showToast("物流模板已保存");
      if (goSync) router.push("/sync");
    } catch (err) {
      setSaveError(readableError(err));
    } finally {
      setSaving(false);
    }
  };

  const ai: AiPanelContent = useMemo(() => {
    if (!isAuthorized) {
      return {
        title: "需先授权",
        summary: "请先完成店铺授权。",
        bullets: [],
        nextAction: { label: "去授权店铺", href: "/authorize" },
      };
    }
    if (loading || classifying) {
      return {
        title: "正在归类物流类型",
        summary:
          "直接使用选品 / SKU 对齐已落库的关联关系，按标题规则识别普货、服装、带电等类型。",
        bullets: ["不再重新同步店铺商品", "识别结果可手动修正", "接着配置物流策略模板"],
      };
    }
    const dist = Object.entries(analysis?.decisionStatusCounts ?? {})
      .filter(([, count]) => count > 0)
      .slice(0, 4)
      .map(([status, count]) => {
        const label: Record<LogisticsDecisionStatus, string> = {
          pending_sku: "待对齐",
          pending_postal_meta: "待补充",
          ready_for_quote: "可报价",
          restricted: "需确认",
          needs_review: "需审核",
        };
        return `${label[status as LogisticsDecisionStatus] ?? status} ${count}`;
      })
      .join(" · ");
    const countries = codesFromSelections(template?.markets ?? [])
      .slice(0, 4)
      .map(countryLabel)
      .join("、");
    const alerts = [];
    if (!skuReadyForNext) {
      alerts.push({
        id: "sku",
        text: "部分商品可能尚未完成 SKU 对齐；仍可先配置物流模板。",
      });
    }
    if ((analysis?.highRiskTypes?.length ?? 0) > 0) {
      alerts.push({
        id: "risk",
        text: "检测到带电 / 食品 / 刀具等特殊类型，后续线路匹配会更严格。",
      });
    }
    return {
      title: "物流策略顾问",
      summary:
        "已基于现有关联完成归类。请确认包装、销售市场与时效偏好。",
      bullets: [
        analysis
          ? `基于 ${analysis.analyzedCount} 个已关联商品`
          : "暂无已关联商品",
        dist ? `类型分布：${dist}` : "暂无类型分布",
        countries ? `销售市场：${countries}` : "尚未选择销售市场",
        "模板将作为后续线路与报价推荐的输入（本页暂不展示线路）",
      ],
      alerts,
      nextAction: { label: "保存并进入同步", action: "save-sync" },
    };
  }, [
    isAuthorized,
    loading,
    classifying,
    analysis,
    template,
    skuReadyForNext,
  ]);

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<StepSidebar />}
        rail={
          <AssistantRail
            assistantContent={
              <CopilotCard heading="AI 物流顾问" content={ai} />
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
            <>
              <CopilotCard
                heading="AI 物流顾问"
                content={ai}
                onNextAction={(action) => {
                  if (action === "save-sync") void handleSave(true);
                }}
              />
              <InfoCard title="下一步">
                保存模板后进入「同步到店铺」。线路与运费推荐将在 Phase 2
                基于本模板与已归类类型生成。
              </InfoCard>
            </>
          }
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title="物流选择"
        breadcrumbs={BREADCRUMBS}
        {...wb.panelProps}
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void load(true)}
            disabled={loading || classifying}
            title="重新归类"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        }
        footer={
          <StickyActionBar
            info={
              analysis
                ? `基于 ${analysis.analyzedCount} 个已关联商品`
                : "配置物流策略模板"
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
        {loading && !analysis ? (
          <div className="flex items-center gap-2 py-12 text-sm text-ink-subtle">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在按已有关联归类物流类型…
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
        ) : (
          <div className="space-y-4">
            {analysis ? (
              <LogisticsTypeSummary
                analysis={analysis}
                correctingId={correctingId}
                onCorrect={(id, type) => void handleCorrect(id, type)}
              />
            ) : null}
            {template ? (
              <LogisticsTemplateForm
                value={template}
                saving={saving}
                error={saveError}
                onChange={setTemplate}
                onSave={() => void handleSave(false)}
              />
            ) : null}
          </div>
        )}
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

export default function LogisticsPage() {
  return <LogisticsContent />;
}
