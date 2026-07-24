"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { api, readableError } from "@/lib/api";
import type { PricingTemplate } from "@/lib/types";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface PricingTemplateSavePayload {
  exchangeRate: number;
  multiplier: number;
  addend: number;
  roundingStrategy: string;
  decimals: number;
  sourceCurrency: string;
  targetCurrency: string;
}

export interface ProductsPricingDrawerProps {
  open: boolean;
  template: PricingTemplate | null;
  saving: boolean;
  error: string | null;
  clearing: boolean;
  onClose: () => void;
  onSave: (payload: PricingTemplateSavePayload) => void;
  onClear: () => void;
}

export interface UseProductsPricingParams {
  shopName: string;
  isAuthorized: boolean;
  showToast: (message: string) => void;
  t: TranslateFn;
  router: AppRouterInstance;
  resetPricingGuideRequested: boolean;
  previewPricingGuide: boolean;
}

export function useProductsPricing({
  shopName,
  isAuthorized,
  showToast,
  t,
  router,
  resetPricingGuideRequested,
  previewPricingGuide,
}: UseProductsPricingParams) {
  const [template, setTemplate] = useState<PricingTemplate | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [clearingTemplate, setClearingTemplate] = useState(false);

  const resetStartedRef = useRef(false);
  useEffect(() => {
    if (!resetPricingGuideRequested || !isAuthorized || !shopName) return;
    if (resetStartedRef.current) return;
    resetStartedRef.current = true;
    void (async () => {
      try {
        const tpl = await api.clearPricingTemplate(shopName);
        setTemplate(tpl);
        showToast(t("productsPage.toastPricingDemoReset"));
      } catch (err) {
        showToast(readableError(err));
      } finally {
        startTransition(() => {
          router.replace("/products", { scroll: false });
        });
      }
    })();
  }, [
    resetPricingGuideRequested,
    isAuthorized,
    shopName,
    showToast,
    router,
    t,
  ]);

  const openPricingDrawer = useCallback(() => {
    if (!isAuthorized) {
      showToast(t("productsPage.toastPricingAuth"));
      return;
    }
    setTemplateError(null);
    setPricingOpen(true);
  }, [isAuthorized, showToast, t]);

  const handleSaveTemplate = useCallback(
    async (payload: PricingTemplateSavePayload) => {
      setSavingTemplate(true);
      setTemplateError(null);
      try {
        const saved = await api.upsertPricingTemplate({ shopName, ...payload });
        setTemplate(saved);
        setPricingOpen(false);
        showToast(t("productsPage.toastPricingSaved"));
        if (previewPricingGuide) {
          startTransition(() => {
            router.replace("/products", { scroll: false });
          });
        }
      } catch (err) {
        setTemplateError(readableError(err));
        showToast(t("productsPage.toastPricingSaveFailed"));
      } finally {
        setSavingTemplate(false);
      }
    },
    [shopName, showToast, previewPricingGuide, router, t]
  );

  const handleClearTemplate = useCallback(async () => {
    if (clearingTemplate) return;
    if (!window.confirm(t("productsPage.clearTemplateConfirm"))) {
      return;
    }
    setClearingTemplate(true);
    setTemplateError(null);
    try {
      const tpl = await api.clearPricingTemplate(shopName);
      setTemplate(tpl);
      setPricingOpen(false);
      showToast(t("productsPage.toastPricingDefaultReset"));
    } catch (err) {
      setTemplateError(readableError(err));
      showToast(readableError(err));
    } finally {
      setClearingTemplate(false);
    }
  }, [clearingTemplate, shopName, showToast, t]);

  const pricingDrawerProps: ProductsPricingDrawerProps = {
    open: pricingOpen,
    template,
    saving: savingTemplate,
    error: templateError,
    clearing: clearingTemplate,
    onClose: () => setPricingOpen(false),
    onSave: (payload) => void handleSaveTemplate(payload),
    onClear: () => void handleClearTemplate(),
  };

  return {
    template,
    setTemplate,
    openPricingDrawer,
    pricingDrawerProps,
  };
}
