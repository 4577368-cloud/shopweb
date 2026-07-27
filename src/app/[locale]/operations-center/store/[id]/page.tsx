"use client";

// 单店富 dossier 路由页（设计「一次调用更丰富」UX 落地核心）。
// 通过通用 dossier 扇出端点一次拉取 8 个 store/* 端点，渲染分区完整档案。
// F7 修复：进页不再静默扣费，需用户显式点击「生成店铺档案」并经二次确认弹窗确认后才发起计费调用。

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import { CostBadge } from "@/components/operations/cost-badge";
import { CreditConfirmDialog } from "@/components/operations/credit-confirm-dialog";
import { CreditInsufficientModal } from "@/components/operations/credit-insufficient-modal";
import { BillingDrawer } from "@/components/operations/billing-drawer";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { HubSidebar } from "@/components/workbench/hub-sidebar";
import { HubRouteGate } from "@/components/workbench/hub-route-gate";
import { SectionGuide } from "@/components/operations/section-guide";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { StoreDossierView } from "@/components/operations/store-dossier-view";
import { useMarketingLedger } from "@/lib/marketing/ledger";
import { useMarketingRunner } from "@/hooks/use-marketing-runner";
import { fetchStoreDossier, CREDIT_PER_CALL } from "@/lib/marketing/api";
import { billingApi } from "@/lib/billing/api";
import { InsufficientCreditsError } from "@/lib/marketing/guard";
import type { StoreDossier } from "@/lib/marketing/types";

// 店铺 dossier：7 个计费端点 × U×2 乘数（§2.2），3 天免费窗口内实际为 0。
// 该数字仅用于二次确认弹窗的预估展示，真实扣点以服务端返回为准。
const STORE_DOSSIER_ESTIMATE = 7 * CREDIT_PER_CALL * 2;

export default function StoreDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <HubRouteGate>
      <StoreDossierContent id={id} />
    </HubRouteGate>
  );
}

function StoreDossierContent({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const wb = useWorkbenchPage("operations-center");
  const ledger = useMarketingLedger();
  const { run, lastConsume, account, wallet, insufficient, clearInsufficient, refreshWallet } =
    useMarketingRunner(ledger.record);
  const [dossier, setDossier] = useState<StoreDossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const remaining = wallet?.balanceCredits ?? account?.remainingApiCredits ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await run("dossier:store", `dossier-store-${id}`, () => fetchStoreDossier(id));
      setDossier(res.data);
    } catch (e) {
      // 余额不足（402）由全局不足弹窗处理，不渲染「未找到」红框。
      if (e instanceof InsufficientCreditsError) return;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id, run]);

  const requestLoad = useCallback(() => setConfirmOpen(true), []);

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

  const breadcrumbs = [
    { label: t("nav.hub"), href: localePath(locale, "/operations-center") },
    { label: t("ops.tabs.competition"), href: localePath(locale, "/operations-center?view=competition") },
    { label: dossier?.store?.name ?? id },
  ];

  if (error) {
    return (
      <WorkbenchShell
        sidebar={<HubSidebar />}
        rail={<AssistantRail assistantContent={<SectionGuide tab="competition" />} strategyCards={null} />}
        {...wb.shellProps}
      >
        <WorkbenchPanel title={t("ops.storePage.heading")} breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
            <p className="text-sm font-medium text-destructive">{t("ops.storePage.notFound")}</p>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              {t("ops.discovery.board.retry")}
            </Button>
            <Link href={localePath(locale, "/operations-center")} className="text-[12px] text-link hover:underline">
              {t("ops.storePage.back")} →
            </Link>
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  // 尚未生成档案（F7：需显式点击 + 确认后才计费）。
  if (!dossier) {
    return (
      <WorkbenchShell
        sidebar={<HubSidebar />}
        rail={<AssistantRail assistantContent={<SectionGuide tab="competition" />} strategyCards={null} />}
        {...wb.shellProps}
      >
        <WorkbenchPanel title={t("ops.storePage.heading")} breadcrumbs={breadcrumbs} {...wb.panelProps}>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[12px] text-ink-subtle">
              {t("ops.storePage.loading")}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-6 py-16 text-center">
              <p className="text-sm font-semibold text-ink">{t("ops.storePage.generateTitle")}</p>
              <p className="max-w-sm text-[12px] leading-relaxed text-ink-muted">
                {t("ops.storePage.generateDesc", { n: STORE_DOSSIER_ESTIMATE })}
              </p>
              <Button variant="primary" size="sm" onClick={requestLoad}>
                {t("ops.storePage.generate")}
              </Button>
              <Link href={localePath(locale, "/operations-center")} className="text-[12px] text-link hover:underline">
                {t("ops.storePage.back")} →
              </Link>
            </div>
          )}
        </WorkbenchPanel>

        <CreditConfirmDialog
          open={confirmOpen}
          estimate={STORE_DOSSIER_ESTIMATE}
          remaining={remaining}
          onConfirm={() => {
            setConfirmOpen(false);
            void load();
          }}
          onCancel={() => setConfirmOpen(false)}
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
        <BillingDrawer
          open={billingOpen}
          wallet={wallet ? { balanceCredits: wallet.balanceCredits } : null}
          onClose={() => setBillingOpen(false)}
          onPurchased={() => {
            refreshWallet();
            setBillingOpen(false);
          }}
        />
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell
      sidebar={<HubSidebar />}
      rail={<AssistantRail assistantContent={<SectionGuide tab="competition" />} strategyCards={null} />}
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title={t("ops.storePage.heading")}
        breadcrumbs={breadcrumbs}
        {...wb.panelProps}
      >
        <div className="space-y-3">
          {lastConsume && (
            <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-muted px-3 py-2 text-[11px]">
              <span className="text-ink-subtle">{t("ops.detail.thisConsume")}</span>
              <CostBadge free={lastConsume.freeWindow} cached={lastConsume.cacheHit} points={lastConsume.actual} />
            </div>
          )}
          <StoreDossierView dossier={dossier} />
          <div className="flex justify-end">
            <Link href={localePath(locale, "/operations-center")} className="text-[12px] text-link hover:underline">
              {t("ops.storePage.back")} →
            </Link>
          </div>
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}
