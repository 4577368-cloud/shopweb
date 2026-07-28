/**
 * Host shell public exports.
 * Feature packages should import adapters from here — not from embedded internals —
 * except when building Host chrome itself.
 */

export {
  useEmbeddedMode,
  readEmbeddedMode,
  withEmbeddedQuery,
  useEmbeddedQueryHref,
  type EmbeddedModeSnapshot,
} from "@/host/embedded/use-embedded-mode";

export { HostModeProvider, useHostMode } from "@/host/host-mode-provider";

export {
  resolveAuthStrategy,
  resolveAuthStrategyFromLocation,
  cookieAuthStrategy,
  sessionTokenAuthStrategy,
  type AuthStrategy,
  type AuthTransportKind,
} from "@/host/adapters/auth-transport";

export {
  navigateInApp,
  replaceInApp,
  hrefInApp,
  type AppRouterLike,
} from "@/host/adapters/navigation";
export { openExternal, openShopifyAdminPath } from "@/host/adapters/external-link";
export { showHostToast, type HostToastTone } from "@/host/adapters/toast";

export { LinkInApp } from "@/host/link-in-app";
export { useNavigateInApp } from "@/host/use-navigate-in-app";
export { EmbeddedHostChrome } from "@/host/embedded/embedded-host-chrome";
export { EmbeddedNavMenu } from "@/host/embedded/embedded-nav-menu";

export {
  exchangeSessionToken,
  ensureEmbeddedAccessToken,
  launchEmbeddedInstall,
} from "@/host/embedded/exchange-session-token";
export {
  getEmbeddedAccessToken,
  setEmbeddedAccessToken,
  clearEmbeddedAccessToken,
} from "@/host/embedded/session-token-store";
