"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Store,
} from "lucide-react";
import { useOnboarding } from "@/context/onboarding-context";
import { api, type AuthorizedShopSummary } from "@/lib/api";
import { SHOP_STORAGE_KEY } from "@/lib/shopify-install";
import { cn } from "@/lib/utils";

function fmtAuthorizedAt(raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("zh-CN", { hour12: false });
}

/**
 * Sidebar shop dropdown: switch among authorized shops, or jump to /install to add another.
 */
export function ShopSwitcher() {
  const { shop, isAuthorized, hydrateAuthorizedShop, showToast } = useOnboarding();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [shops, setShops] = useState<AuthorizedShopSummary[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listAuthorizedShops();
      setShops(Array.isArray(list) ? list : []);
    } catch {
      setShops(
        isAuthorized && shop.domain
          ? [
              {
                shopName: shop.name,
                shopDomain: shop.domain,
                productCount: shop.productCount,
              },
            ]
          : []
      );
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, shop.domain, shop.name, shop.productCount]);

  useEffect(() => {
    if (!open) return;
    void loadShops();
  }, [open, loadShops]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectShop = async (domain: string) => {
    if (switching) return;
    const normalized = domain.trim().toLowerCase();
    if (!normalized) return;
    if (isAuthorized && shop.domain.toLowerCase() === normalized) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      window.localStorage.setItem(SHOP_STORAGE_KEY, normalized);
      const status = await api.getShopStatus(normalized);
      if (!status.authorized) {
        showToast("该店铺授权已失效，请重新授权");
        return;
      }
      hydrateAuthorizedShop({
        name: status.shopName ?? normalized.split(".")[0] ?? normalized,
        domain: status.shopDomain ?? normalized,
        authorizedAt: fmtAuthorizedAt(status.authorizedAt),
        productCount: status.productCount ?? 0,
      });
      showToast(`已切换到 ${status.shopName ?? normalized}`);
      setOpen(false);
    } catch {
      showToast("切换店铺失败，请稍后重试");
    } finally {
      setSwitching(false);
    }
  };

  const label = isAuthorized ? shop.name : "未连接店铺";

  return (
    <div ref={rootRef} className="relative px-4">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
      >
        <Store className="h-3.5 w-3.5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {label}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-4 right-4 z-40 mt-1.5 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface shadow-card"
        >
          <div className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                加载店铺列表…
              </div>
            ) : shops.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-ink-muted">暂无已授权店铺</p>
            ) : (
              shops.map((s) => {
                const active =
                  isAuthorized &&
                  s.shopDomain.toLowerCase() === shop.domain.toLowerCase();
                return (
                  <button
                    key={s.shopDomain}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={switching}
                    onClick={() => void selectShop(s.shopDomain)}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      active ? "bg-brand-soft" : "hover:bg-slate-50",
                      switching && "opacity-60"
                    )}
                  >
                    <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">
                        {s.shopName}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                        {s.shopDomain}
                      </span>
                    </span>
                    {active ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-hairline">
            <Link
              href="/install"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-brand transition-colors hover:bg-brand-soft"
            >
              <Plus className="h-3.5 w-3.5" />
              添加新店铺授权
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
