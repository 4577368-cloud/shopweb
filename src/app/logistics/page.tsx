"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Field, CheckboxRow } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  countryOptions,
  mockLogisticsPlans,
  speedOptions,
} from "@/data/mock";
import { useOnboarding } from "@/context/onboarding-context";
import type { AiPanelContent } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function LogisticsPage() {
  const router = useRouter();
  const {
    logisticsForm,
    updateLogisticsForm,
    selectedLogisticsPlanId,
    setSelectedLogisticsPlanId,
    saveLogistics,
    isAuthorized,
    skuReadyForNext,
  } = useOnboarding();

  const battery = logisticsForm.batteryIncluded;

  const availablePlans = useMemo(
    () =>
      mockLogisticsPlans.map((plan) => ({
        ...plan,
        blocked: battery && !plan.supportsBattery,
      })),
    [battery]
  );

  const selectedPlan =
    availablePlans.find((p) => p.id === selectedLogisticsPlanId) ??
    availablePlans[0];

  useEffect(() => {
    if (selectedPlan?.blocked) {
      const fallback = availablePlans.find((p) => !p.blocked);
      if (fallback) setSelectedLogisticsPlanId(fallback.id);
    }
  }, [selectedPlan, availablePlans, setSelectedLogisticsPlanId]);

  const ai: AiPanelContent = useMemo(() => {
    if (!isAuthorized) {
      return {
        title: "需先授权",
        summary: "请先完成店铺授权。",
        bullets: [],
        nextAction: { label: "去授权店铺", href: "/authorize" },
      };
    }

    const bullets = [
      `当前方案：${selectedPlan.name} · ${selectedPlan.etaDays}`,
      `预估运费 ${selectedPlan.estimatedFee}`,
      logisticsForm.autoTracking
        ? "已开启轨迹自动回传到 Shopify"
        : "未开启轨迹回传，签收状态需人工维护",
    ];

    const alerts = [];
    if (battery) {
      alerts.push({
        id: "battery",
        text: "已勾选带电 / 磁吸：经济海派小包不可用，请使用支持带电的专线。",
      });
    }
    if (logisticsForm.maxShippingFee < 5) {
      alerts.push({
        id: "fee",
        text: `最大可接受运费 $${logisticsForm.maxShippingFee} 可能低于标准专线下限，请确认或调高。`,
      });
    }
    if (!logisticsForm.autoTracking) {
      alerts.push({
        id: "tracking",
        text: "未勾选自动回传轨迹：订单履约状态不会写回 Shopify。",
      });
    }

    return {
      title: "物流确认",
      summary: battery
        ? "带电商品已启用合规渠道过滤。确认偏好后保存，将进入店铺同步。"
        : "按近 30 天订单目的地，默认推荐美线标准专线。确认后保存并进入同步。",
      bullets,
      alerts: alerts.length ? alerts : undefined,
      nextAction: {
        label: "保存并进入同步",
        action: "save",
      },
    };
  }, [
    battery,
    isAuthorized,
    logisticsForm.autoTracking,
    logisticsForm.maxShippingFee,
    selectedPlan,
  ]);

  const handleSave = () => {
    saveLogistics();
    router.push("/sync");
  };

  if (!isAuthorized) {
    return (
      <AppShell ai={ai}>
        <PageHeader
          title="确认物流"
          description="请先完成店铺授权。"
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
    <AppShell
      ai={ai}
      onNextAction={(action) => {
        if (action === "save") handleSave();
      }}
    >
      <PageHeader
        title="确认物流"
        description="选择默认履约方案与偏好。保存后写入店铺配置，并进入同步步骤。"
        breadcrumbs={[
          { label: "工作台", href: "/" },
          { label: "确认物流" },
        ]}
      />

      {!skuReadyForNext ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          SKU 对齐尚未达到完成门槛。你可以先配置物流，但建议先处理完冲突项。
          <Link href="/sku-align" className="ml-1 font-medium underline">
            返回 SKU 对齐
          </Link>
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-3 gap-3">
        {availablePlans.map((plan) => {
          const selected = plan.id === selectedLogisticsPlanId;
          return (
            <button
              key={plan.id}
              type="button"
              disabled={plan.blocked}
              onClick={() => setSelectedLogisticsPlanId(plan.id)}
              className={cn(
                "flex h-[148px] flex-col rounded-lg border bg-white p-3.5 text-left transition-colors",
                plan.blocked && "cursor-not-allowed opacity-50",
                selected
                  ? "border-teal-600 ring-1 ring-teal-600"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {plan.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {plan.carrier}
                  </p>
                </div>
                {plan.blocked ? (
                  <Badge variant="danger">不可用</Badge>
                ) : plan.recommended ? (
                  <Badge variant="teal">推荐</Badge>
                ) : selected ? (
                  <Badge variant="outline">已选</Badge>
                ) : null}
              </div>
              <div className="mt-3 grid flex-1 grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-[11px] text-slate-400">时效</p>
                  <p className="text-sm font-medium text-slate-800">
                    {plan.etaDays}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400">预估运费</p>
                  <p className="text-sm font-medium text-slate-800">
                    {plan.estimatedFee}
                  </p>
                </div>
              </div>
              <p className="mt-auto text-[11px] text-slate-500">
                {plan.blocked ? plan.batteryNote : plan.coverage}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-md border border-teal-200 bg-teal-50/60 px-3.5 py-2.5">
        <div>
          <p className="text-xs font-medium text-teal-900">当前已选方案</p>
          <p className="mt-0.5 text-sm text-teal-950">
            {selectedPlan.name} · {selectedPlan.carrier} · {selectedPlan.etaDays}{" "}
            · {selectedPlan.estimatedFee}
          </p>
        </div>
        <Badge variant="teal">已选</Badge>
      </div>

      {battery ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          已勾选「带电 / 磁吸」：不支持带电的物流方案已禁用
          {availablePlans.some((p) => p.blocked)
            ? `（${availablePlans
                .filter((p) => p.blocked)
                .map((p) => p.name)
                .join("、")}）`
            : ""}
          。系统已自动切到可用方案。
        </div>
      ) : null}

      <Card className="mb-3">
        <CardHeader>
          <div>
            <CardTitle>履约偏好</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              用于新订单的默认物流决策
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="目标国家">
              <Select
                value={logisticsForm.targetCountry}
                onChange={(e) =>
                  updateLogisticsForm({ targetCountry: e.target.value })
                }
              >
                {countryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="时效偏好">
              <Select
                value={logisticsForm.speedPreference}
                onChange={(e) =>
                  updateLogisticsForm({
                    speedPreference: e.target
                      .value as typeof logisticsForm.speedPreference,
                  })
                }
              >
                {speedOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="最大可接受运费（USD）">
              <Input
                type="number"
                min={1}
                step={0.5}
                value={logisticsForm.maxShippingFee}
                onChange={(e) =>
                  updateLogisticsForm({
                    maxShippingFee: Number(e.target.value),
                  })
                }
              />
            </Field>
            <div className="flex flex-col gap-3">
              <CheckboxRow
                checked={logisticsForm.batteryIncluded}
                onChange={(checked) =>
                  updateLogisticsForm({ batteryIncluded: checked })
                }
              >
                商品可能带电 / 含磁吸配件
              </CheckboxRow>
              <CheckboxRow
                checked={logisticsForm.autoTracking}
                onChange={(checked) =>
                  updateLogisticsForm({ autoTracking: checked })
                }
              >
                自动回传物流轨迹到 Shopify
              </CheckboxRow>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-xs font-medium text-slate-700">方案要点</p>
            <ul className="mt-1.5 space-y-1">
              {selectedPlan.reasons.map((reason) => (
                <li
                  key={reason}
                  className="flex gap-2 text-[11px] leading-4 text-slate-600"
                >
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-800">
            保存后进入店铺同步
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            物流方案与履约规则将写入配置，不会在本页直接执行同步
          </p>
        </div>
        <Button onClick={handleSave}>保存并进入同步</Button>
      </div>
    </AppShell>
  );
}
