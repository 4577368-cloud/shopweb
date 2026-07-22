"use client";

import { Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogisticsTemplateSetupCard({
  onOpenTemplate,
}: {
  onOpenTemplate: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
      <div className="border-b border-hairline/80 bg-brand-soft/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-strong" />
          <h2 className="text-sm font-semibold text-ink">先配置物流模板</h2>
        </div>
      </div>
      <div className="flex flex-col items-center px-6 py-10 text-center sm:px-10">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted">
          <Package className="h-7 w-7 text-ink-subtle" />
        </div>
        <p className="max-w-md text-sm leading-relaxed text-ink-muted">
          销售国家、包装方式与时效偏好决定线路匹配与预估报价。保存模板后，系统将按商品自动拉取报价并确认普货方案。
        </p>
        <Button className="mt-6" onClick={onOpenTemplate}>
          添加物流模板
        </Button>
      </div>
    </section>
  );
}
