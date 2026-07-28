/**
 * Toast adapter.
 * Embedded → App Bridge toast; standalone → no-op here (callers keep ToastHost).
 */

import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";

export type HostToastTone = "info" | "success" | "warning" | "critical";

export function showHostToast(
  message: string,
  opts?: { tone?: HostToastTone; durationMs?: number }
): void {
  if (typeof window === "undefined") return;
  const mode = readEmbeddedMode();
  if (mode.isEmbedded && window.shopify?.toast?.show) {
    window.shopify.toast.show(message, {
      duration: opts?.durationMs ?? 4000,
      isError: opts?.tone === "critical" || opts?.tone === "warning",
    });
    return;
  }
  if (process.env.NODE_ENV === "development") {
    console.debug("[host/toast]", message, opts?.tone ?? "info");
  }
}
