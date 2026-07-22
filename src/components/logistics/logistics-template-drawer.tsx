"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { X, Save, Trash2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MARKET_GROUPS } from "@/lib/logistics/markets";
import {
  codesFromSelections,
  marketSelectionForCountry,
  singleCountryCodeFromMarkets,
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
  shopName,
  templates,
  activeTemplate,
  onSave,
  onDelete,
  onSelect,
  onClose,
}: {
  shopName: string;
  templates: LogisticsTemplate[];
  activeTemplate: LogisticsTemplate | null;
  onSave: (template: LogisticsTemplateUpsert, id?: string) => Promise<LogisticsTemplate>;
  onDelete: (id: string) => Promise<void>;
  onSelect: (template: LogisticsTemplate) => void;
  onClose: () => void;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LogisticsTemplate>>({});
  /** null = creating a new template; string = editing an existing one */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTemplate) {
      const single = singleCountryCodeFromMarkets(activeTemplate.markets);
      const normalized = single
        ? { ...activeTemplate, markets: marketSelectionForCountry(single) }
        : activeTemplate;
      setFormData(normalized);
      setEditingId(activeTemplate.id ?? null);
      if (single) {
        const group = MARKET_GROUPS.find((g) =>
          g.countries.some((c) => c.code === single)
        );
        setSelectedGroupId(group?.id ?? null);
      } else {
        setSelectedGroupId(null);
      }
    } else {
      setFormData({
        shopName,
        packaging: "MINIMAL",
        speedPreference: "BALANCED",
        markets: [],
      });
      setSelectedGroupId(null);
    }
  }, [activeTemplate, shopName]);

  const selectedCountry = useMemo(
    () => singleCountryCodeFromMarkets(formData.markets ?? []),
    [formData.markets]
  );

  const selectedGroup = useMemo(() => {
    return MARKET_GROUPS.find((g) => g.id === selectedGroupId);
  }, [selectedGroupId]);

  const selectCountry = useCallback((code: string) => {
    setFormData((prev) => ({
      ...prev,
      markets: marketSelectionForCountry(code),
    }));
  }, []);

  const handleSave = async () => {
    if (!shopName.trim()) {
      setError("缺少店铺标识，请先完成店铺授权");
      return;
    }
    if (!formData.packaging || !formData.speedPreference) {
      setError("请选择包装方式和时效偏好");
      return;
    }
    if (!selectedCountry) {
      setError("请选择一个销售国家");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const now = new Date();
      const autoName = `物流模板 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      const upsertData: LogisticsTemplateUpsert = {
        shopName,
        name: formData.name || autoName,
        packaging: formData.packaging,
        speedPreference: formData.speedPreference,
        markets: marketSelectionForCountry(selectedCountry),
      };

      const saved = await onSave(
        upsertData,
        editingId &&
          editingId !== "default" &&
          templates.some((t) => t.id === editingId)
          ? editingId
          : undefined
      );
      setEditingId(saved.id);
      onSelect(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const target = templates.find((t) => t.id === editingId);
    if (!target) return;
    if (!confirm(`确定删除模板 "${target.name}" 吗？`)) return;

    try {
      await onDelete(editingId);
      const remaining = templates.filter((t) => t.id !== editingId);
      if (remaining.length > 0) {
        onSelect(remaining[0]);
      } else {
        onClose();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleNewTemplate = () => {
    setEditingId(null);
    setFormData({
      shopName,
      packaging: "MINIMAL",
      speedPreference: "BALANCED",
      markets: [],
      name: "",
    });
    setSelectedGroupId(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30"
        aria-label="关闭物流模板面板"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">物流模板</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-subtle">
              配置目标市场、包装方式与时效偏好，将用于后续线路与价格推荐。
            </p>
          </div>
          <div className="flex items-center gap-2">
            {templates.length > 0 ? (
              <select
                value={editingId ?? ""}
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (!nextId) {
                    handleNewTemplate();
                    return;
                  }
                  const selected = templates.find((t) => t.id === nextId);
                  if (selected) {
                    setEditingId(selected.id);
                    onSelect(selected);
                  }
                }}
                className="rounded-[var(--radius-control)] border border-hairline bg-surface px-2 py-1 text-xs text-ink"
              >
                <option value="">新建模板</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={handleNewTemplate}
              className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
              title="新建模板"
              aria-label="新建模板"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
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
              <label className="block mb-2 text-xs font-medium text-ink">
                销售国家
                <span className="ml-1 font-normal text-ink-subtle">（单选，用于运费试算）</span>
              </label>
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
                  <p className="mb-2 text-[10px] text-ink-subtle">{selectedGroup.labelZh}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedGroup.countries.map((country) => {
                      const isSelected = selectedCountry === country.code;
                      return (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => selectCountry(country.code)}
                          className={cn(
                            "rounded-[var(--radius-control)] border px-1.5 py-1.5 text-center text-[10px] font-medium transition-colors overflow-hidden truncate",
                            isSelected
                              ? "border-brand bg-brand-soft text-brand-strong"
                              : "border-hairline bg-surface text-ink-subtle hover:border-hairline-strong"
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
            <p className="mt-2 text-[11px] text-red-600">{error}</p>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          {editingId && templates.some((t) => t.id === editingId) && templates.length > 1 ? (
            <Button variant="danger" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1 h-3 w-3" />
              删除
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !selectedCountry}>
            <Save className="mr-1 h-3 w-3" />
            {isSaving ? "保存中…" : editingId ? "保存模板" : "创建模板"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}