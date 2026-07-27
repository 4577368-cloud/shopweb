"use client";

/**
 * 运营中枢功能开关。
 *
 * 2026-07：整中枢（订单中心 / 运营中心 / 履约中心）已下线隐藏，
 * 广告监控将独立成 APP。此处强制关闭，保留 API 以免调用方编译失败。
 */

export function isHubFeatureEnabled(): boolean {
  return false;
}

export function setHubFeatureEnabled(_value: boolean): void {
  /* no-op — hub is retired in this product */
}

export function useHubFeatureFlag() {
  return {
    enabled: false as const,
    toggle: () => {
      /* no-op */
    },
    setEnabled: (_value: boolean) => {
      /* no-op */
    },
  };
}
