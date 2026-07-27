// 运营中心 · 第二版完整前端交互（Phase A，mock 驱动可点击原型）。
// 编排：HubSidebar + 左栏(用量卡) + 中栏(Top Tab + 视图) + 右栏 Copilot + 详情抽屉。
// 默认落地 Tab = 发现（设计 §8）。Hub 开关见 feature-flag + HubRouteGate。
//
// 页面本身只做「组装」：状态与出站逻辑已抽到独立 Hooks（useMarketingRunner / useOperationsNavigation /
// useOperationsWatchlist），避免页面文件无限膨胀。

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { messages } from "@/i18n/messages";
import { localePath } from "@/i18n/LocaleLink";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { WorkbenchSidebar } from "@/components/workbench/workbench-sidebar";
import { Button } from "@/components/ui/button";
import { HubRouteGate } from "@/components/workbench/hub-route-gate";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { useMarketingLedger } from "@/lib/marketing/ledger";
import { fmtCompact, fmtUsd } from "@/lib/marketing/format";
import { ctaLabel } from "@/lib/marketing/enums";
import { isGuardCancel } from "@/lib/marketing/guard";
import type { AdDetail, AdspyDetail, CompetitionProductRow, StoreRow, TtsShopDetail, TtsShopRow } from "@/lib/marketing/types";
import { DiscoveryView, type DiscoveryViewHandle } from "@/components/operations/discovery-view";
import { CompetitionView, type CompetitionViewHandle } from "@/components/operations/competition-view";
import { CreativesView, type CreativesViewHandle } from "@/components/operations/creatives-view";
import { AiImageSearch } from "@/components/operations/ai-image-search";
import { AdDetailDrawer } from "@/components/operations/ad-detail-drawer";
import { CompetitionDetailDrawer } from "@/components/operations/competition-detail-drawer";
import { TtsShopDetailDrawer } from "@/components/operations/tts-shop-detail-drawer";
import { CompareStoresModal } from "@/components/operations/compare-stores-modal";
import { UsageDrawer } from "@/components/operations/usage-drawer";
import { UsageCard } from "@/components/operations/usage-card";
import { CreditsIndicator } from "@/components/operations/credits-indicator";
import { BillingDrawer } from "@/components/operations/billing-drawer";
import { CreditInsufficientModal } from "@/components/operations/credit-insufficient-modal";
import { ChevronDown, ChevronUp } from "@/lib/ui/icons";
import { billingApi } from "@/lib/billing/api";
import {
  MarketingCopilot,
  type CopilotContext,
  type CopilotMsg,
} from "@/components/operations/marketing-copilot";
import { SectionGuide } from "@/components/operations/section-guide";
import { useMarketingRunner } from "@/hooks/use-marketing-runner";
import { useOperationsNavigation, type OperationsTab } from "@/hooks/use-operations-navigation";
import { useOperationsWatchlist } from "@/hooks/use-operations-watchlist";
import { useFavorites } from "@/hooks/use-favorites";
import { FavoritesView } from "@/components/operations/favorites-view";
import { useOnboarding } from "@/context/onboarding-context";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import { fetchAdDetail, fetchCompetitionProducts, fetchTtsShopDetail } from "@/lib/marketing/api";

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
  const {
    account,
    wallet,
    insufficient,
    clearInsufficient,
    refreshWallet,
    ctx,
    lastConsume,
    consumeError,
    run,
  } = useMarketingRunner(ledger.record);
  const nav = useOperationsNavigation();
  const watchlist = useOperationsWatchlist();
  const competitorTogglingIds = watchlist.togglingIds;
  const favorites = useFavorites();
  const favIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const item of favorites.items) {
      set.add(`${item.type}:${item.id}`);
    }
    return set;
  }, [favorites.items]);

  const discoveryRef = useRef<DiscoveryViewHandle>(null);
  const competitionRef = useRef<CompetitionViewHandle>(null);
  const creativesRef = useRef<CreativesViewHandle>(null);

  const handleMarketingFetch = useCallback(() => {
    if (nav.tab === "discovery") discoveryRef.current?.fetchCurrent();
    else if (nav.tab === "competition") competitionRef.current?.fetchCurrent();
    else if (nav.tab === "creatives") creativesRef.current?.fetchCurrent();
  }, [nav.tab]);

  const fetchDisabled =
    nav.tab === "imageSearch" ||
    nav.tab === "favorites" ||
    (nav.tab === "discovery" && nav.discoverySeg === "board");

  // 详情抽屉
  const [detailAd, setDetailAd] = useState<AdDetail | null>(null);
  const [detailStore, setDetailStore] = useState<StoreRow | null>(null);
  const [detailStoreProducts, setDetailStoreProducts] = useState<CompetitionProductRow[] | null>(null);
  const [detailTtsShop, setDetailTtsShop] = useState<TtsShopRow | null>(null);
  const [detailTtsShopDetail, setDetailTtsShopDetail] = useState<TtsShopDetail | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  // 领取欢迎分（幂等；§4.2）。成功后刷新钱包。
  const handleClaimWelcome = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await billingApi.claimWelcome();
      if (res.claimed || res.alreadyClaimed) {
        setClaimed(true);
        refreshWallet();
      }
    } catch {
      // 静默：不足弹窗仍可引导去充值
    } finally {
      setClaiming(false);
    }
  }, [claiming, refreshWallet]);

  // G5e：从服务端水合欢迎领取状态，避免花完 welcome 后顶栏按钮反复出现
  useEffect(() => {
    let cancelled = false;
    billingApi
      .welcomeStatus()
      .then((s) => {
        if (!cancelled && s.claimed) setClaimed(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // 竞店对比弹窗
  const [compareStores, setCompareStores] = useState<StoreRow[] | null>(null);

  // 右栏 Copilot
  const [subject, setSubject] = useState("");
  const [copilotMsgs, setCopilotMsgs] = useState<CopilotMsg[]>([
    { id: "seed", role: "bot", text: t("ops.copilot.welcome") },
  ]);

  // 发现/榜行「看竞店」：带 product_id 进入产品视角（谁在投这款品）。
  const handleViewCompetitor = useCallback(
    (productId: string) => nav.navigate({ tab: "competition", competitionProductId: productId, competitionQuery: "" }),
    [nav]
  );

  // TikTok 店铺 / 图搜来的「看竞店」：按店铺名/ID 搜（store 视角），清掉 product 上下文。
  const handleViewCompetitorStore = useCallback(
    (store: string) => nav.navigate({ tab: "competition", competitionQuery: store, competitionProductId: "" }),
    [nav]
  );

  // 图搜：关注竞店（☆ 状态）/ 看竞店（跳竞店 Tab 搜索）。
  const handleFollowStore = useCallback(
    (store: string) => watchlist.toggleCompetitor({ id: store, name: store }),
    [watchlist]
  );
  const handleViewStore = useCallback(
    (store: string) => nav.navigate({ tab: "competition", competitionQuery: store, competitionProductId: "" }),
    [nav]
  );

  const handleViewTtsDetail = useCallback(
    (row: TtsShopRow) => {
      setSubject(row.title);
      setDetailTtsShop(row);
      // 列表行已含大部分指标；详情端点补「投放花费区间/域名/广告商品率/佣金/落地页」等。
      // 经 run 护栏：享 3 天免费窗口（按店铺 id），首拉 1 积分，3 天内复看 0 积分；并计入计费账本。
      run("tiktok-shop/detail", `ttsDetail:${row.id}`, () => fetchTtsShopDetail({ id: row.id }))
        .then((res) => setDetailTtsShopDetail(res.data))
        .catch(() => setDetailTtsShopDetail(null));
    },
    [run]
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

  const onOpenStore = useCallback(
    async (store: StoreRow) => {
      setSubject(store.name);
      setDetailStore(store);
      // 免费端点：拉该店在投 SKU（0 点），供用户先选哪款再分析。
      try {
        const res = await run(
          "store/detail/competition/products",
          `compprod:${store.id}`,
          () => fetchCompetitionProducts({ id: store.id })
        );
        setDetailStoreProducts(res.data.list);
      } catch {
        setDetailStoreProducts([]);
      }
    },
    [run]
  );

  // 竞店 ☆：localStorage 持久化（无左栏列表 UI）。
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

  // 让 Copilot 分析 Adspy 创意详情（详情抽屉"分析"按钮）。
  const handleAnalyzeAdspy = useCallback(
    (detail: AdspyDetail) => {
      setSubject(detail.title);
      const ai = detail.aiAnalysis;
      const hookLine = ai ? ` 主钩子：${ai.mainHook}` : "";
      const dataLine = `«${detail.title}» — ${t(`ops.platform.${detail.platform}`)} · ${fmtCompact(detail.likes)} ${t(
        "ops.creatives.card.likes"
      )} · ${detail.activeDays} ${t("ops.creatives.card.days")} · CTA ${ctaLabel(detail.ctaType)} · 广告费 ${
        detail.adFee != null ? fmtUsd(detail.adFee) : "—"
      }.${hookLine}`;
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
    { id: "favorites", label: t("ops.tabs.favorites") },
  ];

  const sidebarFooter = (
    <UsageCard
      account={account}
      wallet={wallet}
      sessionUsed={ledger.sessionUsed}
      onOpenDetail={() => setUsageOpen(true)}
      onOpenBilling={() => setBillingOpen(true)}
    />
  );

  return (
    <WorkbenchShell
      sidebar={<WorkbenchSidebar bottomPanel={sidebarFooter} />}
      rail={
        <AssistantRail
          assistantContent={<SectionGuide tab={nav.tab} />}
          strategyCards={
            <div className="flex min-h-0 max-h-[42vh] flex-col overflow-hidden">
              <button
                type="button"
                onClick={() => setCopilotOpen((v) => !v)}
                className="flex items-center justify-between rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-muted hover:bg-surface-muted"
              >
                <span>{t("ops.copilotPreviewTitle")}</span>
                {copilotOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
              {copilotOpen && (
                <div className="mt-1 min-h-0 flex-1 overflow-hidden">
                  <MarketingCopilot
                    messages={copilotMsgs}
                    onSend={handleCopilotSend}
                    context={copilotContext}
                  />
                </div>
              )}
            </div>
          }
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel title={t("ops.pageTitle")} breadcrumbs={breadcrumbs} {...wb.panelProps}>
        <div className="mb-4 flex items-center justify-end gap-2">
          {wallet && wallet.freeCredits === 0 && !claimed && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={claiming}
              onClick={handleClaimWelcome}
              title={t("ops.claim.claim")}
            >
              {claiming ? t("ops.claim.claiming") : t("ops.claim.claim")}
            </Button>
          )}
          <CreditsIndicator
            apiRemaining={account?.remainingApiCredits ?? 0}
            monitorRemaining={account?.remainingMonitorCredits ?? 0}
            wallet={wallet}
            context={ctx}
            consumeError={consumeError}
            onOpenUsage={() => setUsageOpen(true)}
            onOpenBilling={() => setBillingOpen(true)}
            onFetch={handleMarketingFetch}
            fetchDisabled={fetchDisabled}
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
            ref={discoveryRef}
            run={run}
            shop={shopApiName}
            onViewCompetitor={handleViewCompetitor}
            onViewCompetitorStore={handleViewCompetitorStore}
            onViewTtsDetail={handleViewTtsDetail}
            onViewDetail={handleViewDetail}
            onLearnCreatives={handleLearnCreatives}
            initialSegment={nav.discoverySeg}
            onSegmentChange={nav.setDiscoverySeg}
            welcomeClaimed={claimed}
            onClaimWelcome={handleClaimWelcome}
            onOpenBilling={() => setBillingOpen(true)}
            favoritedIds={favIdSet}
            onToggleFavorite={(item) =>
              favorites.toggleFavorite({
                id: item.id,
                type: item.type as import("@/hooks/use-favorites").FavoriteType,
                title: item.title,
                subtitle: item.subtitle,
                image: item.image,
              })
            }
          />
        )}
        {nav.tab === "competition" && (
          <CompetitionView
            ref={competitionRef}
            run={run}
            onOpenDetail={onOpenStore}
            onRequestCompare={(stores) => setCompareStores(stores)}
            initialQuery={nav.competitionQuery}
            initialProductId={nav.competitionProductId}
            onQueryChange={nav.setCompetitionQuery}
            collectedIds={collectedSet}
            onToggleCollect={handleToggleCollect}
            togglingIds={competitorTogglingIds}
          />
        )}
        {nav.tab === "creatives" && (
          <CreativesView
            ref={creativesRef}
            run={run}
            onViewAdvertiser={handleViewCompetitorStore}
            onAnalyzeAdspy={handleAnalyzeAdspy}
            initialQuery={nav.creativesQuery}
            onQueryChange={nav.setCreativesQuery}
            favoritedIds={favIdSet}
            onToggleFavorite={(item) =>
              favorites.toggleFavorite({
                id: item.id,
                type: item.type as import("@/hooks/use-favorites").FavoriteType,
                title: item.title,
                subtitle: item.subtitle,
                image: item.image,
              })
            }
          />
        )}
        {nav.tab === "imageSearch" && (
          <AiImageSearch
            run={run}
            walletBalance={wallet?.balanceCredits ?? null}
            onFollowStore={handleFollowStore}
            onViewStore={handleViewStore}
          />
        )}
        {nav.tab === "favorites" && (
          <FavoritesView
            items={favorites.items}
            storeItems={watchlist.competitors}
            onRemove={favorites.removeFavorite}
            onRemoveStore={(id) => watchlist.toggleCompetitor({ id, name: "" })}
            onClearType={favorites.clearByType}
            onViewStore={(id) => {
              const item = favorites.items.find((x) => x.id === id && x.type === "store");
              const storeItem = watchlist.competitors.find((x) => x.id === id);
              const title = item?.title ?? storeItem?.name ?? id;
              nav.navigate({ tab: "competition", competitionQuery: title, competitionProductId: "" });
            }}
            onViewProduct={handleViewDetail}
            onViewCreative={(id) => {
              const item = favorites.items.find((x) => x.id === id && x.type === "creative");
              if (item) nav.navigate({ tab: "creatives", creativesQuery: item.subtitle || item.title });
            }}
            onViewTtsShop={(id) => {
              const item = favorites.items.find((x) => x.id === id && x.type === "ttsShop");
              if (item) nav.navigate({ tab: "discovery", discoverySeg: "tiktok" });
            }}
            onViewRankProduct={(id) => {
              nav.navigate({ tab: "discovery", discoverySeg: "board" });
            }}
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
        products={detailStoreProducts}
        onClose={() => {
          setDetailStore(null);
          setDetailStoreProducts(null);
        }}
        onToggleCollect={handleToggleCollect}
        collected={detailStore ? collectedSet.has(detailStore.id) : false}
        toggling={detailStore ? competitorTogglingIds.has(detailStore.id) : false}
        run={run}
      />
      <TtsShopDetailDrawer
        row={detailTtsShop}
        detail={detailTtsShopDetail}
        onClose={() => {
          setDetailTtsShop(null);
          setDetailTtsShopDetail(null);
        }}
        onViewCompetitor={handleViewStore}
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
        account={account}
        wallet={wallet}
        onClose={() => setUsageOpen(false)}
      />

      <BillingDrawer
        open={billingOpen}
        wallet={wallet ? { balanceCredits: wallet.balanceCredits } : null}
        onClose={() => setBillingOpen(false)}
        onPurchased={() => {
          refreshWallet();
          setBillingOpen(false);
        }}
      />

      <CreditInsufficientModal
        open={insufficient}
        welcomed={claimed}
        onClaim={handleClaimWelcome}
        onOpenBilling={() => {
          clearInsufficient();
          setBillingOpen(true);
        }}
        onClose={clearInsufficient}
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
