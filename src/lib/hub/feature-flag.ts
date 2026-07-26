"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "tb_hub_enabled";
const CHANGE_EVENT = "tb_hub_enabled_change";
/** @deprecated Migrated to {@link STORAGE_KEY}; read once then removed. */
const LEGACY_HUB_MODE_KEY = "tangbuy:hub-mode";

/**
 * 运营中枢功能开关。
 *
 * 优先级：localStorage 用户显式设置 > 环境变量 NEXT_PUBLIC_HUB_ENABLED > 开发环境默认开 / 生产默认关
 *
 * 规则：
 * - 默认关闭（false），便于功能未完全调试完毕前不对外展示
 * - 开发环境若 localStorage 未设置，则默认开启以方便调试
 * - 用户可在 账户 → 安全设置 中手动开启/关闭
 */
function readStoredHubEnabled(): boolean | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    return stored === "true";
  }
  try {
    const legacy = window.localStorage.getItem(LEGACY_HUB_MODE_KEY);
    if (legacy === "1" || legacy === "0") {
      const enabled = legacy === "1";
      window.localStorage.setItem(STORAGE_KEY, String(enabled));
      window.localStorage.removeItem(LEGACY_HUB_MODE_KEY);
      return enabled;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getDefaultEnabled(): boolean {
  const stored = readStoredHubEnabled();
  if (stored !== null) return stored;

  const fromEnv = process.env.NEXT_PUBLIC_HUB_ENABLED;
  if (fromEnv === "true") return true;
  if (fromEnv === "false") return false;

  if (typeof window === "undefined") return false;
  return process.env.NODE_ENV === "development";
}

export function isHubFeatureEnabled(): boolean {
  return getDefaultEnabled();
}

export function setHubFeatureEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(value));
  window.dispatchEvent(
    new CustomEvent(CHANGE_EVENT, { detail: value })
  );
}

/**
 * React hook：订阅运营中枢开关状态。
 * 切换后调用 reload 可使所有组件同步（比跨组件广播更简单可靠）。
 */
export function useHubFeatureFlag() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(getDefaultEnabled());
    sync();
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === "boolean") setEnabled(detail);
      else sync();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) sync();
    };
    window.addEventListener(CHANGE_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setHubEnabled = useCallback((value: boolean) => {
    setHubFeatureEnabled(value);
    setEnabled(value);
  }, []);

  const toggle = useCallback(() => {
    setHubEnabled(!enabled);
  }, [enabled, setHubEnabled]);

  return { enabled, toggle, setEnabled: setHubEnabled };
}
