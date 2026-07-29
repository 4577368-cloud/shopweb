"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "tb_hub_enabled";
/** @deprecated Migrated to {@link STORAGE_KEY}; read once then removed. */
const LEGACY_HUB_MODE_KEY = "tangbuy:hub-mode";

/**
 * 运营中枢 / 订单中心功能开关。
 *
 * 优先级：localStorage 用户显式设置 > 环境变量 NEXT_PUBLIC_HUB_ENABLED > 开发环境默认开 / 生产默认关
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
}

export function useHubFeatureFlag() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(getDefaultEnabled());
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
