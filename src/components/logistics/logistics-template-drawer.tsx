"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { X, Plus, Check, ChevronRight, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MARKET_GROUPS } from "@/lib/logistics/markets";
import {
  codesFromSelections,
  selectionsFromCodes,
} from "@/components/logistics/market-multi-select";
import type {
  LogisticsTemplate,
  LogisticsTemplateUpsert,
  PackagingType,
  LogisticsSpeedPreference,
} from "@/lib/types";

const PACKAGING: { value: PackagingType; label: string; hint: string }[] = [
  { value: "MINIMAL", label: "极简包装", hint: "轻量袋装 / 原厂简装" },
  { value: "CARTON", label: "纸箱包装", hint: "加固纸箱，适合易损" },
];

const SPEEDS: {
  value: LogisticsSpeedPreference;
  label: string;
  hint: string;
}[] = [
  { value: "ECONOMY", label: "经济型", hint: "优先成本" },
  { value: "FAST", label: "快速型", hint: "优先时效" },
  { value: "BALANCED", label: "综合型", hint: "成本与时效平衡" },
];

export function LogisticsTemplateDrawer({
  templates,
  activeTemplate,
  onSave,
  onDelete,
  onSelect,
  onClose,
}: {
  templates: LogisticsTemplate[];
  activeTemplate: LogisticsTemplate | null;
  onSave: (template: LogisticsTemplateUpsert, id?: string) => Promise<LogisticsTemplate>;
  onDelete: (id: string) => Promise<void>;
  onSelect: (template: LogisticsTemplate) => void;
  onClose: () => void;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LogisticsTemplate>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTemplate) {
      setFormData(activeTemplate);
      const countryCodes = codesFromSelections(activeTemplate.markets);
      if (countryCodes.length > 0) {
        const firstCode = countryCodes[0];
        const group = MARKET_GROUPS.find((g) =>
          g.countries.some((c) => c.code === firstCode)
        );
        setSelectedGroupId(group?.id ?? null);
      } else {
        setSelectedGroupId(null);
      }
    } else {
      setFormData({
        packaging: "MINIMAL",
        speedPreference: "BALANCED",
        markets: [],
      });
      setSelectedGroupId(null);
    }
  }, [activeTemplate]);

  const countryCodes = useMemo(() => {
    return codesFromSelections(formData.markets ?? []);
  }, [formData.markets]);

  const selectedGroup = useMemo(() => {
    return MARKET_GROUPS.find((g) => g.id === selectedGroupId);
  }, [selectedGroupId]);

  const toggleCountry = useCallback((code: string) => {
    const currentCodes = codesFromSelections(formData.markets ?? []);
    const newCodes = currentCodes.includes(code)
      ? currentCodes.filter((c) => c !== code)
      : [...currentCodes, code];

    setFormData((prev) => ({
      ...prev,
      markets: selectionsFromCodes(newCodes),
    }));
  }, [formData.markets]);

  const selectAllInGroup = useCallback(() => {
    if (!selectedGroup) return;
    const groupCodes = selectedGroup.countries.map((c) => c.code);
    const currentCodes = codesFromSelections(formData.markets ?? []);
    const newCodes = [...new Set([...currentCodes, ...groupCodes])];

    setFormData((prev) => ({
      ...prev,
      markets: selectionsFromCodes(newCodes),
    }));
  }, [selectedGroup, formData.markets]);

  const handleSave = async () => {
    if (!formData.packaging || !formData.speedPreference) {
      setError("请选择包装方式和时效偏好");
      return;
    }
    if (countryCodes.length === 0) {
      setError("请至少选择一个销售国家");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const now = new Date();
      const autoName = `物流模板 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const upsertData: LogisticsTemplateUpsert = {
        shopName: formData.shopName ?? "",
        name: formData.name || autoName,
        packaging: formData.packaging,
        speedPreference: formData.speedPreference,
        markets: formData.markets ?? [],
      };

      const saved = await onSave(upsertData, activeTemplate?.id);
      onSelect(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeTemplate) return;
    if (!confirm(`确定删除模板 "${activeTemplate.name}" 吗？`)) return;

    try {
      await onDelete(activeTemplate.id);
      if (templates.length > 1) {
        onSelect(templates[0]);
      } else {
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNewTemplate = () => {
    setFormData({
      packaging: "MINIMAL",
      speedPreference: "BALANCED",
      markets: [],
      name: "",
    });
    setSelectedGroupId(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-lg flex flex-col shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3 bg-surface">
          <h2 className="text-sm font-semibold text-ink">物流模板</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-surface-muted"
          >
            <X className="h-4 w-4 text-ink-subtle" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-36 border-r border-hairline bg-surface-muted/40 flex flex-col">
            <div className="p-2">
              <Button
                variant="secondary"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleNewTemplate}
              >
                <Plus className="mr-1 h-3 w-3" />
                新增模板
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className={cn(
                      "w-full px-2 py-1.5 text-left text-[11px] truncate transition-colors",
                      activeTemplate?.id === t.id
                        ? "bg-surface text-ink font-medium"
                        : "text-ink-subtle hover:bg-surface/60"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      <ChevronRight className={cn("h-3 w-3", activeTemplate?.id === t.id ? "opacity-100" : "opacity-0")} />
                      {t.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <div>
                <label className="block mb-1 text-xs font-medium text-ink">模板名称</label>
                <input
                  type="text"
                  value={formData.name ?? ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="自动命名"
                  className="w-full rounded-[var(--radius-control)] border border-hairline px-3 py-2 text-xs bg-surface"
                />
              </div>

              <div>
                <label className="block mb-2 text-xs font-medium text-ink">目标市场</label>
                <div className="flex flex-wrap gap-1.5">
                  {MARKET_GROUPS.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                        selectedGroupId === group.id
                          ? "bg-brand text-white"
                          : "bg-surface-muted text-ink-subtle hover:bg-surface-muted/80"
                      )}
                    >
                      {group.labelZh}
                    </button>
                  ))}
                </div>

                {selectedGroup && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-ink-subtle">{selectedGroup.labelZh}</span>
                      <button
                        type="button"
                        onClick={selectAllInGroup}
                        className="text-[10px] text-brand hover:underline"
                      >
                        全选
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedGroup.countries.map((country) => {
                        const isSelected = countryCodes.includes(country.code);
                        return (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => toggleCountry(country.code)}
                            className={cn(
                              "rounded px-2 py-1 text-[10px] font-medium transition-colors",
                              isSelected
                                ? "bg-brand-soft text-brand-strong"
                                : "bg-surface-muted text-ink-subtle hover:bg-surface-muted/80"
                            )}
                          >
                            {isSelected && <Check className="inline mr-0.5 h-2.5 w-2.5" />}
                            {country.nameZh}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block mb-2 text-xs font-medium text-ink">包装方式</label>
                <div className="grid grid-cols-2 gap-2">
                  {PACKAGING.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, packaging: o.value }))}
                      className={cn(
                        "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                        formData.packaging === o.value
                          ? "border-brand bg-brand-soft"
                          : "border-hairline bg-surface hover:border-hairline-strong"
                      )}
                    >
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          formData.packaging === o.value ? "text-brand-strong" : "text-ink"
                        )}
                      >
                        {o.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-subtle">{o.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block mb-2 text-xs font-medium text-ink">时效偏好</label>
                <div className="grid grid-cols-3 gap-2">
                  {SPEEDS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, speedPreference: o.value }))}
                      className={cn(
                        "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                        formData.speedPreference === o.value
                          ? "border-brand bg-brand-soft"
                          : "border-hairline bg-surface hover:border-hairline-strong"
                      )}
                    >
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          formData.speedPreference === o.value ? "text-brand-strong" : "text-ink"
                        )}
                      >
                        {o.label}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-subtle">{o.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error ? (
              <p className="mt-3 text-xs text-amber-700">{error}</p>
            ) : null}

            <div className="mt-6 flex gap-2">
              {activeTemplate && templates.length > 1 ? (
                <Button
                  variant="danger"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleDelete}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  删除
                </Button>
              ) : null}
              <div className="flex-1" />
              <Button
                variant="secondary"
                size="sm"
                className="h-8 text-xs"
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleSave}
                disabled={isSaving || countryCodes.length === 0}
              >
                <Save className="mr-1 h-3 w-3" />
                {isSaving ? "保存中…" : "保存模板"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
