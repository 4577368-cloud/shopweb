// 运营中心 · 第二版完整前端交互（Phase A，mock 驱动可点击原型）。
// 编排：HubSidebar + 左栏(Watchlist + 用量卡) + 中栏(市场脉搏头 + Top Tab + 上下文条 + 视图 + 快捷操作 footer)
//        + 右栏(营销 Copilot, 引用真实字段) + 统一详情抽屉 + 竞店对比弹窗。
// 默认落地 Tab = 发现（设计 §8）。HUB_ENABLED 控制是否暴露（同订单中心）。
//
// 页面本身只做「组装」：状态与出站逻辑已抽到独立 Hooks（useMarketingRunner / useOperationsNavigation /
// useOperationsWatchlist），避免页面文件无限膨胀。

"use client";

import { useCallback, useMemo, useState } from "react";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { messages } from "@/i18n/messages";
import { localePath } from "@/i18n/LocaleLink";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { WorkbenchSidebar } from "@/components/workbench/workbench-sidebar";
import { HubRouteGate } from "@/components/workbench/hub-route-gate";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { useMarketingLedger } from "@/lib/marketing/ledger";
import { fetchAdDetail } from "@/lib/marketing/api";
import { fmtCompact } from "@/lib/marketing/format";
import { ctaLabel } from "@/lib/marketing/enums";
import { isGuardCancel } from "@/lib/marketing/guard";
import type { AdDetail, StoreRow } from "@/lib/marketing/types";
import { DiscoveryView } from "@/components/operations/discovery-view";
import { CompetitionView } from "@/components/operations/competition-view";
import { CreativesView } from "@/components/operations/creatives-view";
import { AiImageSearch } from "@/components/operations/ai-image-search";
import { AdDetailDrawer } from "@/components/operations/ad-detail-drawer";
import { CompetitionDetailDrawer } from "@/components/operations/competition-detail-drawer";
import { CompareStoresModal } from "@/components/operations/compare-stores-modal";
import { UsageDrawer } from "@/components/operations/usage-drawer";
import { Watchlist } from "@/components/operations/watchlist";
import { UsageCard } from "@/components/operations/usage-card";
import { CreditsIndicator } from "@/components/operations/credits-indicator";
import {
  MarketingCopilot,
  type CopilotContext,
  type CopilotMsg,
} from "@/components/operations/marketing-copilot";
import { SectionGuide } from "@/components/operations/section-guide";
import { useMarketingRunner } from "@/hooks/use-marketing-runner";
import { useOperationsNavigation, type OperationsTab } from "@/hooks/use-operations-navigation";
import { useOperationsWatchlist } from "@/hooks/use-operations-watchlist";
import { useOnboarding } from "@/context/onboarding-context";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";

// Copilot 意图关键词：按意图分语言存于 i18n（ops.copilot.keywords.*），运行时并集所有语言的同义词，
// 使任意语言的用户输入都能命中正确意图，且新增语言只需补 i18n 无需改逻辑。
type CopilotIntent = "hooks" | "copy" | "compare";
const COPILOT_INTENTS: CopilotIntent[] = ["hooks", "copy", "compare"];

const COPILOT_KEYWORDS: Record<CopilotIntent, string[]> = (() => {
  const kw = messages.en.ops.copilot.keywords;
  const result = {} as Record<CopilotIntent, string[]>;
  for (const intent of COPILOT_INTENTS) {
    const set = new Set<string>();
    const entry = kw[intent];
    for (const locale of Object.keys(entry) as (keyof typeof entry)[]) {
      const raw = entry[locale];
      if (typeof raw === "string") {
        raw.split("|").map((s) => s.trim()).filter(Boolean).forEach((k) => set.add(k));
      }
    }
    result[intent] = [...set];
  }
  return result;
})();

export default function OperationsCenterPage() {
  return (
    <HubRouteGate>
      <OperationsCenterContent />
    </HubRouteGate>
  );
}

function OperationsCenterContent() {
  const t = useT();
  const locale = useLocale();
  const wb = useWorkbenchPage("operations-center");
  const { shop } = useOnboarding();
  const shopApiName = resolveShopApiName(shop);

  const ledger = useMarketingLedger();
  const { account, ctx, lastConsume, run } = useMarketingRunner(ledger.record);
  const nav = useOperationsNavigation();
  const watchlist = useOperationsWatchlist(
    useCallback(
      (patch: { tab: "competition" | "creatives" | "discovery"; query: string }) => {
        if (patch.tab === "competition") {
          nav.navigate({ tab: "competition", competitionQuery: patch.query });
        } else if (patch.tab === "creatives") {
          nav.navigate({ tab: "creatives", creativesQuery: patch.query });
        } else {
          nav.navigate({ tab: "discovery" });
        }
      },
      [nav]
    )
  );

  // 详情抽屉
  const [detailAd, setDetailAd] = useState<AdDetail | null>(null);
  const [detailStore, setDetailStore] = useState<StoreRow | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);

  // 竞店对比弹窗
  const [compareStores, setCompareStores] = useState<StoreRow[] | null>(null);

  // 右栏 Copilot
  const [subject, setSubject] = useState("");
  const [copilotMsgs, setCopilotMsgs] = useState<CopilotMsg[]>([
    { id: "seed", role: "bot", text: t("ops.copilot.welcome") },
  ]);

  const handleViewCompetitor = useCallback(
    (productId: string) => nav.navigate({ tab: "competition", competitionQuery: productId }),
    [nav]
  );

  // 图搜结果卡快捷动作：关注此店（加入左栏竞店清单）/ 看竞店（跳竞店 Tab 以店名搜）。
  const handleFollowStore = useCallback(
    (store: string) => watchlist.toggleCompetitor({ id: store, name: store }),
    [watchlist]
  );
  const handleViewStore = useCallback(
    (store: string) => nav.navigate({ tab: "competition", competitionQuery: store }),
    [nav]
  );

  const handleViewDetail = useCallback(
    async (adId: string) => {
      try {
        const res = await run("ad-products/detail", `detail:${adId}`, () => fetchAdDetail(adId));
        setSubject(res.data.product.title);
        setDetailAd(res.data);
      } catch (e) {
        if (!isGuardCancel(e)) {
          // 真实错误：详情抽屉不打开（视图已各自处理错误红框）。
        }
      }
    },
    [run]
  );

  const handleLearnCreatives = useCallback(
    () => nav.navigate({ tab: "creatives" }),
    [nav]
  );

  const onOpenStore = useCallback((store: StoreRow) => {
    setSubject(store.name);
    setDetailStore(store);
  }, []);

  // 竞店关注集合：派生自左栏 Watchlist > 竞店组，☆ 按钮 / 详情抽屉 / 左栏 三方共享同一份持久化数据。
  const collectedSet = useMemo(
    () => new Set(watchlist.competitors.map((c) => c.id)),
    [watchlist.competitors]
  );
  const handleToggleCollect = useCallback(
    (store: StoreRow) => {
      watchlist.toggleCompetitor({ id: store.id, name: store.name });
    },
    [watchlist]
  );

  // 当前分析对象的真实字段（注入 Copilot 引用卡）
  const copilotContext = useMemo<CopilotContext | null>(() => {
    if (!detailAd) return null;
    return {
      title: detailAd.product.title,
      price: `$${detailAd.product.usdPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      platform: t(`ops.platform.${detailAd.platform}`),
      likes: fmtCompact(detailAd.likeCount),
      cta: ctaLabel(detailAd.ctaType),
    };
  }, [detailAd, t]);

  // 右栏 Copilot：确定性回复（v1 静态，不接真实 LLM）。意图识别走 i18n 关键词（任意语言输入均可命中）。
  const handleCopilotSend = useCallback(
    (text: string) => {
      const lower = text.toLowerCase();
      let intent: CopilotIntent | null = null;
      for (const name of Object.keys(COPILOT_KEYWORDS) as CopilotIntent[]) {
        if (COPILOT_KEYWORDS[name].some((k) => lower.includes(k.toLowerCase()))) {
          intent = name;
          break;
        }
      }
      let reply: string;
      if (intent === "hooks") {
        reply = subject ? `${t("ops.copilot.replyHooks")}（${subject}）` : t("ops.copilot.replyHooks");
      } else if (intent === "copy") {
        reply = t("ops.copilot.msgCopyUnavailable");
      } else if (intent === "compare") {
        reply = t("ops.copilot.replyCompare");
      } else {
        reply = t("ops.copilot.fallback");
      }
      setCopilotMsgs((prev) => [
        ...prev,
        { id: `u_${Date.now()}`, role: "user", text },
        { id: `b_${Date.now()}`, role: "bot", text: reply },
      ]);
    },
    [t, subject]
  );

  // 让 Copilot 分析当前创意：引用真实字段生成分析。
  const handleAnalyze = useCallback(
    (detail: AdDetail) => {
      setSubject(detail.product.title);
      const dataLine = `«${detail.product.title}» — $${detail.product.usdPrice.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })} · ${t(`ops.platform.${detail.platform}`)} · ${fmtCompact(detail.likeCount)} ${t("ops.creatives.card.likes")} · CTA ${ctaLabel(detail.ctaType)}.`;
      const reply = `${dataLine}\n\n${t("ops.copilot.replyHooks")}`;
      setCopilotMsgs((prev) => [
        ...prev,
        { id: `u_${Date.now()}`, role: "user", text: t("ops.copilot.chips.hooks") },
        { id: `b_${Date.now()}`, role: "bot", text: reply },
      ]);
    },
    [t]
  );



  const breadcrumbs = [
    { label: t("nav.hub"), href: localePath(locale, "/operations-center") },
    { label: t("ops.breadcrumb") },
  ];

  const TAB_DEFS: { id: OperationsTab; label: string }[] = [
    { id: "discovery", label: t("ops.tabs.discovery") },
    { id: "competition", label: t("ops.tabs.competition") },
    { id: "creatives", label: t("ops.tabs.creatives") },
    { id: "imageSearch", label: t("ops.tabs.imageSearch") },
  ];

  const watchlistPanel = (
    <>
      <Watchlist
        tts={watchlist.tts}
        competitors={watchlist.competitors}
        ads={watchlist.ads}
        onSelect={watchlist.onSelect}
        onSync={watchlist.onSync}
        onAdd={watchlist.onAdd}
      />
      <div className="mt-3">
        <UsageCard
          account={account}
          sessionUsed={ledger.sessionUsed}
          onOpenDetail={() => setUsageOpen(true)}
        />
      </div>
    </>
  );

  return (
    <WorkbenchShell
      sidebar={<WorkbenchSidebar bottomPanel={watchlistPanel} />}
      rail={
        <AssistantRail
          assistantContent={<SectionGuide tab={nav.tab} />}
          strategyCards={
            <div className="flex min-h-0 max-h-[42vh] flex-col overflow-hidden">
              <MarketingCopilot
                messages={copilotMsgs}
                onSend={handleCopilotSend}
                context={copilotContext}
              />
            </div>
          }
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel title={t("ops.pageTitle")} breadcrumbs={breadcrumbs} {...wb.panelProps}>
        <div className="mb-4 flex justify-end">
          <CreditsIndicator
            apiRemaining={account?.remainingApiCredits ?? 0}
            monitorRemaining={account?.remainingMonitorCredits ?? 0}
            context={ctx}
            onOpenUsage={() => setUsageOpen(true)}
          />
        </div>

        <div className="mb-3">
          <SegmentedTabsOps
            tabs={TAB_DEFS}
            value={nav.tab}
            onValueChange={(id) => nav.setTab(id as OperationsTab)}
          />
        </div>

        {nav.tab === "discovery" && (
          <DiscoveryView
            run={run}
            shop={shopApiName}
            onViewCompetitor={handleViewCompetitor}
            onViewDetail={handleViewDetail}
            onLearnCreatives={handleLearnCreatives}
            initialSegment={nav.discoverySeg}
            onSegmentChange={nav.setDiscoverySeg}
          />
        )}
        {nav.tab === "competition" && (
          <CompetitionView
            run={run}
            onOpenDetail={onOpenStore}
            onRequestCompare={(stores) => setCompareStores(stores)}
            initialQuery={nav.competitionQuery}
            onQueryChange={nav.setCompetitionQuery}
            collectedIds={collectedSet}
            onToggleCollect={handleToggleCollect}
          />
        )}
        {nav.tab === "creatives" && (
          <CreativesView
            run={run}
            onOpenDetail={handleViewDetail}
            initialQuery={nav.creativesQuery}
            onQueryChange={nav.setCreativesQuery}
          />
        )}
        {nav.tab === "imageSearch" && (
          <AiImageSearch
            run={run}
            onOpenDetail={handleViewDetail}
            onFollowStore={handleFollowStore}
            onViewStore={handleViewStore}
          />
        )}

      </WorkbenchPanel>

      <AdDetailDrawer
        detail={detailAd}
        consume={lastConsume}
        onClose={() => setDetailAd(null)}
        onAnalyze={handleAnalyze}
      />
      <CompetitionDetailDrawer
        store={detailStore}
        onClose={() => setDetailStore(null)}
        onToggleCollect={handleToggleCollect}
        collected={detailStore ? collectedSet.has(detailStore.id) : false}
      />
      <CompareStoresModal
        open={!!compareStores}
        stores={compareStores ?? []}
        onClose={() => setCompareStores(null)}
      />
      <UsageDrawer
        open={usageOpen}
        entries={ledger.entries}
        sessionUsed={ledger.sessionUsed}
        onClose={() => setUsageOpen(false)}
      />
    </WorkbenchShell>
  );
}

// 中栏 Top Tab（复用 SegmentedTabs chip 变体）。
function SegmentedTabsOps({
  tabs,
  value,
  onValueChange,
}: {
  tabs: { id: string; label: string }[];
  value: string;
  onValueChange: (id: string) => void;
}) {
  return (
    <SegmentedTabs
      variant="chip"
      tabs={tabs.map((x) => ({ id: x.id, label: x.label }))}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
