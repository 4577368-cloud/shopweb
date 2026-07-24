"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { mockShop } from "@/data/mock";
import { buildOverviewMetrics } from "@/lib/dashboard/overview";
import {
  getAuthSessionReadySnapshot,
  subscribeAuthSessionReady,
} from "@/lib/onboarding/auth-session-ready";
import {
  clearAuthVerified,
  fetchRestoredShopAuth,
  markAuthVerified,
  readStoredShopDomain,
  resolveShopDomainToRestore,
  shopDisplayNameFromDomain,
} from "@/lib/restore-shop-auth";
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

  const authSessionReady = useSyncExternalStore(
    subscribeAuthSessionReady,
    getAuthSessionReadySnapshot,
    () => true
  );

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
        name: info.name,
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
        name:
          domain
            .split(".")[0]
            ?.split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ") || prev.name,
        authorizedAt: new Date()
          .toLocaleString("zh-CN", { hour12: false })
          .replace(/\//g, "-"),
      }));
      setOverview(buildOverviewMetrics("authorized", null, null));
      updateStepStatus("authorize", "completed");
      updateStepStatus("products", "pending_confirm");
    }, 900);
  }, [shopDomainInput, setOverview, updateStepStatus]);

  useLayoutEffect(() => {
    const domain = readStoredShopDomain();
    if (!domain) return;
    setShopDomainInput(domain);
    setShop((prev) => ({
      ...prev,
      domain,
      name: shopDisplayNameFromDomain(domain),
    }));
    setAuthStatus("authorized");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    void (async () => {
      try {
        const shopToRestore = await resolveShopDomainToRestore();
        if (cancelled) return;

        if (shopToRestore) {
          setShopDomainInput(shopToRestore);
          setShop((prev) => ({
            ...prev,
            domain: shopToRestore,
            name: shopDisplayNameFromDomain(shopToRestore),
          }));
        }

        if (!shopToRestore) {
          return;
        }

        const restored = await fetchRestoredShopAuth(shopToRestore);
        if (cancelled) return;

        if (restored) {
          hydrateAuthorizedShop(restored);
          markAuthVerified(restored.domain);
          return;
        }

        clearAuthVerified();
        setAuthStatus("ready_to_authorize");
      } catch {
        // Keep optimistic session from localStorage; user can retry authorize.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateAuthorizedShop]);

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
  };
}
