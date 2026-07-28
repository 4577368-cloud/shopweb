"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAuth } from "@/context/user-context";
import { mockShop } from "@/data/mock";
import { buildOverviewMetrics } from "@/lib/dashboard/overview";
import {
  getAuthSessionReadySnapshot,
  subscribeAuthSessionReady,
} from "@/lib/onboarding/auth-session-ready";
import {
  clearRememberedShopDomain,
  fetchRestoredShopAuth,
  markAuthVerified,
  resolveShopDomainToRestore,
  restoreShopAuthFromAuthorizedList,
} from "@/lib/restore-shop-auth";
import { normalizeShopDomain } from "@/lib/shopify-install";
import { normalizeShopApiName, shopApiNameFromDomain } from "@/lib/resolve-shop-api-name";
import type { AuthStatus, OnboardingStep, OverviewMetrics, ShopInfo, StepId } from "@/lib/types";

export interface UseOnboardingShopAuthParams {
  updateStepStatus: (id: StepId, status: OnboardingStep["status"]) => void;
  setOverview: Dispatch<SetStateAction<OverviewMetrics>>;
}

/** Shop identity, OAuth restore, and authorize-step mock connect. */
export function useOnboardingShopAuth({
  updateStepStatus,
  setOverview,
}: UseOnboardingShopAuthParams) {
  const [shop, setShop] = useState<ShopInfo>(() => ({
    ...mockShop,
    domain: "",
    name: "",
    productCount: 0,
    authorizedAt: undefined,
  }));
  const [authStatus, setAuthStatus] = useState<AuthStatus>("waiting_input");
  const [shopDomainInput, setShopDomainInput] = useState("");
  /** True while resolving /status after login / embedded session exchange. */
  const [shopAuthHydrating, setShopAuthHydrating] = useState(false);

  const authSessionReady = useSyncExternalStore(
    subscribeAuthSessionReady,
    getAuthSessionReadySnapshot,
    () => true
  );

  const { status: userStatus, bootstrapping: userBootstrapping } = useAuth();

  const handleSetDomain = useCallback((v: string) => {
    setShopDomainInput(v);
    setAuthStatus((prev) => {
      if (prev === "authorized" || prev === "authorizing") return prev;
      return v.trim() ? "ready_to_authorize" : "waiting_input";
    });
  }, []);

  const hydrateAuthorizedShop = useCallback(
    (info: {
      name: string;
      domain: string;
      authorizedAt: string;
      productCount: number;
    }) => {
      setAuthStatus("authorized");
      setShop((prev) => ({
        ...prev,
        name: normalizeShopApiName(info.name) || shopApiNameFromDomain(info.domain),
        domain: info.domain,
        authorizedAt: info.authorizedAt,
        productCount: info.productCount,
      }));
      setOverview(buildOverviewMetrics("authorized", null, null));
      updateStepStatus("authorize", "completed");
      updateStepStatus("products", "pending_confirm");
      markAuthVerified(info.domain);
    },
    [setOverview, updateStepStatus]
  );

  const connectShop = useCallback(() => {
    if (!shopDomainInput.trim()) {
      setAuthStatus("waiting_input");
      return;
    }
    setAuthStatus("authorizing");
    window.setTimeout(() => {
      const domain = shopDomainInput.trim().replace(/^https?:\/\//, "");
      setAuthStatus("authorized");
      setShop((prev) => ({
        ...prev,
        domain,
        name: shopApiNameFromDomain(domain),
        authorizedAt: new Date()
          .toLocaleString("zh-CN", { hour12: false })
          .replace(/\//g, "-"),
      }));
      setOverview(buildOverviewMetrics("authorized", null, null));
      updateStepStatus("authorize", "completed");
      updateStepStatus("products", "pending_confirm");
    }, 900);
  }, [shopDomainInput, setOverview, updateStepStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (userBootstrapping) return;
    // P2：店铺绑定在用户账号下；未登录时不打 /shopify/auth/status（避免 JWT WARN）。
    if (userStatus !== "authenticated") {
      setShopAuthHydrating(false);
      return;
    }

    let cancelled = false;
    setShopAuthHydrating(true);

    void (async () => {
      try {
        const shopToRestore = await resolveShopDomainToRestore();
        if (cancelled) return;

        if (shopToRestore) {
          const normalized = normalizeShopDomain(shopToRestore) || shopToRestore;
          setShopDomainInput(normalized);
          setShop((prev) => ({
            ...prev,
            domain: normalized,
            name: shopApiNameFromDomain(normalized),
          }));
        }

        if (!shopToRestore) {
          // No remembered domain — still try sole/first bound shop from account list.
          try {
            const fromList = await restoreShopAuthFromAuthorizedList();
            if (cancelled) return;
            if (fromList) {
              hydrateAuthorizedShop(fromList);
              return;
            }
          } catch {
            // fall through to empty state
          }
          setShopDomainInput("");
          setShop((prev) => ({
            ...prev,
            domain: "",
            name: "",
            productCount: 0,
            authorizedAt: undefined,
          }));
          setAuthStatus("waiting_input");
          return;
        }

        let restored: Awaited<ReturnType<typeof fetchRestoredShopAuth>> = null;
        try {
          restored = await fetchRestoredShopAuth(shopToRestore);
        } catch {
          restored = null;
        }
        if (cancelled) return;

        if (restored) {
          hydrateAuthorizedShop(restored);
          return;
        }

        // /status failed or unauthorized, but account may still have a bound shop
        // (especially sole-shop accounts after login remount).
        try {
          const fromList = await restoreShopAuthFromAuthorizedList();
          if (cancelled) return;
          if (fromList) {
            hydrateAuthorizedShop(fromList);
            return;
          }
        } catch {
          // fall through
        }

        clearRememberedShopDomain();
        setShopDomainInput("");
        setShop((prev) => ({
          ...prev,
          domain: "",
          name: "",
          productCount: 0,
          authorizedAt: undefined,
        }));
        setAuthStatus("waiting_input");
      } catch {
        // Keep optimistic session from localStorage; user can retry authorize.
      } finally {
        if (!cancelled) setShopAuthHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateAuthorizedShop, userBootstrapping, userStatus]);

  const isAuthorized = authStatus === "authorized";
  const authBootstrapping = !authSessionReady;

  return {
    shop,
    setShop,
    authStatus,
    shopDomainInput,
    setShopDomainInput: handleSetDomain,
    connectShop,
    hydrateAuthorizedShop,
    isAuthorized,
    authSessionReady,
    authBootstrapping,
    shopAuthHydrating,
  };
}
