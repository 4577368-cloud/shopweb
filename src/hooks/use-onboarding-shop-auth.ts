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
} from "@/lib/restore-shop-auth";
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
    if (userStatus !== "authenticated") return;

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
            name: shopApiNameFromDomain(shopToRestore),
          }));
        }

        if (!shopToRestore) {
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

        const restored = await fetchRestoredShopAuth(shopToRestore);
        if (cancelled) return;

        if (restored) {
          hydrateAuthorizedShop(restored);
          markAuthVerified(restored.domain);
          return;
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
  };
}
