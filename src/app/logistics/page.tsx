"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, RefreshCw, Settings, Plus } from "lucide-react";
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
import { LogisticsTemplateDrawer } from "@/components/logistics/logistics-template-drawer";
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
import { cn } from "@/lib/utils";

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

  const load = useCallback(
    async (forceClassify: boolean) => {
      setLoading(true);
      setError(null);
      try {
        setClassifying(true);
        const [a, ts] = await Promise.all([
          forceClassify
            ? api.analyzeLogistics(shopName, true)
            : api.analyzeLogistics(shopName, false),
          api.listLogisticsTemplates(shopName),
        ]);
        setAnalysis(a);
        setTemplates(ts);
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

  const handleSaveTemplate = async (upsertData: { shopName: string; name?: string; packaging: string; speedPreference: string; markets: { marketGroupId: string; countryCodes: string[] }[] }, id?: string) => {
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
        setActiveTemplate(remaining.length > 0 ? remaining[0] : DEFAULT_TEMPLATE(shopName));
      }
      showToast("模板已删除");
    } catch (err) {
      showToast(readableError(err));
    }
  };

  const handleSelectTemplate = (template: LogisticsTemplate) => {
    setActiveTemplate(template);
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
    const countries = codesFromSelections(activeTemplate?.markets ?? [])
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
    activeTemplate,
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void load(true)}
              disabled={loading || classifying}
              title="重新归类"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
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
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTemplate(t)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    activeTemplate?.id === t.id
                      ? "bg-brand text-white"
                      : "bg-surface-muted text-ink-subtle hover:bg-surface-muted/80"
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-ink-subtle"
              onClick={() => {
                setActiveTemplate(null);
                setShowDrawer(true);
              }}
            >
              <Plus className="mr-1 h-3 w-3" />
              新增模板
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-ink-subtle"
            onClick={() => {
              setShowDrawer(true);
            }}
          >
            <Settings className="mr-1 h-3 w-3" />
            模板配置
          </Button>
        </div>

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
          </div>
        )}
      </WorkbenchPanel>

      {showDrawer && (
        <LogisticsTemplateDrawer
          templates={templates}
          activeTemplate={activeTemplate}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onSelect={handleSelectTemplate}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </WorkbenchShell>
  );
}

export default function LogisticsPage() {
  return <LogisticsContent />;
}