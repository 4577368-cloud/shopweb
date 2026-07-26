"use client";

// 单品富 dossier 路由页（设计「一次调用更丰富」UX 落地核心）。
// 通过通用 dossier 扇出端点一次拉取商品详情 + 市场同类创意墙。

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import { CostBadge } from "@/components/operations/cost-badge";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { HubSidebar } from "@/components/workbench/hub-sidebar";
import { HubRouteGate } from "@/components/workbench/hub-route-gate";
import { SectionGuide } from "@/components/operations/section-guide";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { ProductDossierView } from "@/components/operations/product-dossier-view";
import { useMarketingLedger } from "@/lib/marketing/ledger";
import { useMarketingRunner } from "@/hooks/use-marketing-runner";
import { fetchProductDossier } from "@/lib/marketing/api";
import type { ProductDossier } from "@/lib/marketing/types";

export default function ProductDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <HubRouteGate>
      <ProductDossierContent id={id} />
    </HubRouteGate>
  );
}

function ProductDossierContent({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const wb = useWorkbenchPage("operations-center");
  const ledger = useMarketingLedger();
  const { run, lastConsume } = useMarketingRunner(ledger.record);
  const [dossier, setDossier] = useState<ProductDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await run("dossier:product", `dossier-product-${id}`, () => fetchProductDossier(id));
      setDossier(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id, run]);

  useEffect(() => {
    void load();
  }, [load]);

  const breadcrumbs = [
    { label: t("nav.hub"), href: localePath(locale, "/operations-center") },
    { label: t("ops.tabs.creatives"), href: localePath(locale, "/operations-center?view=creatives") },
    { label: dossier?.detail?.product?.title ?? id },
  ];

  if (error) {
    return (
      <WorkbenchShell
        sidebar={<HubSidebar />}
        rail={<AssistantRail assistantContent={<SectionGuide tab="creatives" />} strategyCards={null} />}
        {...wb.shellProps}
      >
        <WorkbenchPanel title={t("ops.productPage.heading")} breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-destructive-soft bg-destructive-soft px-6 py-12 text-center">
            <p className="text-sm font-medium text-destructive">{t("ops.productPage.notFound")}</p>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              {t("ops.discovery.board.retry")}
            </Button>
            <Link href={localePath(locale, "/operations-center")} className="text-[12px] text-link hover:underline">
              {t("ops.productPage.back")} →
            </Link>
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell
      sidebar={<HubSidebar />}
      rail={<AssistantRail assistantContent={<SectionGuide tab="creatives" />} strategyCards={null} />}
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title={t("ops.productPage.heading")}
        breadcrumbs={breadcrumbs}
        {...wb.panelProps}
      >
        {loading || !dossier ? (
          <div className="flex items-center justify-center py-16 text-[12px] text-ink-subtle">
            {t("ops.productPage.loading")}
          </div>
        ) : (
          <div className="space-y-3">
            {lastConsume && (
              <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-muted px-3 py-2 text-[11px]">
                <span className="text-ink-subtle">{t("ops.detail.thisConsume")}</span>
                <CostBadge free={lastConsume.freeWindow} cached={lastConsume.cacheHit} points={lastConsume.actual} />
              </div>
            )}
            <ProductDossierView dossier={dossier} />
          </div>
        )}
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}
