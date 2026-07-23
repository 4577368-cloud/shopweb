"use client";

import { Package, Sparkles } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";

export function LogisticsTemplateSetupCard({
  onOpenTemplate,
}: {
  onOpenTemplate: () => void;
}) {
  const t = useT();

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
      <div className="border-b border-hairline/80 bg-brand-soft/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-strong" />
          <h2 className="text-sm font-semibold text-ink">
            {t("logisticsTemplateSetup.title")}
          </h2>
        </div>
      </div>
      <div className="flex flex-col items-center px-6 py-10 text-center sm:px-10">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
          <Package className="h-7 w-7 text-ink-subtle" />
        </div>
        <p className="max-w-md text-sm leading-relaxed text-ink-muted">
          {t("logisticsTemplateSetup.description")}
        </p>
        <Button className="mt-6" onClick={onOpenTemplate}>
          {t("logisticsTemplateSetup.addTemplate")}
        </Button>
      </div>
    </section>
  );
}
