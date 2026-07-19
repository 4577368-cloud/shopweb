"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SkuBindingPanel } from "@/components/sku-align/sku-binding-panel";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/context/onboarding-context";

export default function SkuAlignPage() {
  const { isAuthorized } = useOnboarding();

  if (!isAuthorized) {
    return (
      <AppShell>
        <PageHeader
          title="SKU 绑定"
          description="请先完成店铺授权。"
          breadcrumbs={[
            { label: "授权店铺", href: "/authorize" },
            { label: "SKU 绑定" },
          ]}
          actions={
            <Link href="/authorize">
              <Button>去授权店铺</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="SKU 绑定"
        description="已在「智能选品」确认匹配的商品，在这里按变体查看当前货源绑定。"
        breadcrumbs={[
          { label: "工作台", href: "/" },
          { label: "智能选品", href: "/products" },
          { label: "SKU 绑定" },
        ]}
        actions={
          <Link href="/logistics">
            <Button variant="secondary">
              进入物流确认
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <SkuBindingPanel />
    </AppShell>
  );
}
