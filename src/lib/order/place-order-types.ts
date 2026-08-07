import type { PackagingType } from "@/lib/types";
import { packagingToIncrementList } from "@/lib/logistics/template-params";
import type { DropshipPackageCreateInfo } from "./dropship-purchase";
import type { OrderSummary } from "./types";

/** Declare mode: 0 fuzzy / 1 self — aligned with tang-plugin. */
export type PlaceDeclareMode = 0 | 1;

/** Tax registration: 0 self / 3 platform IOSS / 4 personal IOSS. */
export type PlaceRegistrationType = 0 | 3 | 4;

export interface OrderShippingAddress {
  name: string;
  phone: string;
  zip: string;
  countryCode: string;
  countryName: string;
  province: string;
  city: string;
  address1: string;
  address2?: string;
}

export interface PlaceLineCapability {
  declareModes: PlaceDeclareMode[];
  registrationTypes: PlaceRegistrationType[];
  /** Minimum declare value for fuzzy mode (USD). */
  minFuzzyTax?: number;
  taxFree?: boolean;
}

export interface PlaceAvailableLine {
  lineId: number;
  lineName: string;
  deliveryTime?: string;
  /** Estimated deposit / freight preview hint (USD) before full package calc. */
  estimateFeeUsd?: number;
  tags?: string[];
  restrictionSummary?: string;
  recommended?: boolean;
  supported: PlaceLineCapability;
}

export interface PlaceAmountPreview {
  goodsAmountUsd: number;
  packageAmountUsd: number;
  totalUsd: number;
  currency: "USD";
}

export type PlaceWizardStep = 1 | 2;

export interface PlaceWizardDraft {
  step: PlaceWizardStep;
  packaging: PackagingType;
  address: OrderShippingAddress;
  lines: PlaceAvailableLine[];
  selectedLineId: number | null;
  declareMode: PlaceDeclareMode;
  registrationType: PlaceRegistrationType;
  declareCurrency: string;
  tax: number;
  taxNo: string;
  /** Template declare preference was incompatible with selected line. */
  declareClamped?: boolean;
  /** Order-level lines differ from per-SKU logistics estimates. */
  orderRecalcBanner?: boolean;
  linesLoading?: boolean;
  linesError?: string | null;
  previewLoading?: boolean;
  preview?: PlaceAmountPreview | null;
  previewError?: string | null;
  submitting?: boolean;
  submitError?: string | null;
  agreed?: boolean;
}

export interface PlaceOrderConfirmPayload {
  order: OrderSummary;
  packageCreateInfo: DropshipPackageCreateInfo;
  preview: PlaceAmountPreview;
  address: OrderShippingAddress;
}

export function isAddressComplete(addr: OrderShippingAddress | null | undefined): boolean {
  if (!addr) return false;
  return Boolean(
    addr.name?.trim() &&
      addr.phone?.trim() &&
      addr.address1?.trim() &&
      addr.city?.trim() &&
      addr.countryCode?.trim()
  );
}

export function buildPackageCreateInfoFromDraft(
  draft: PlaceWizardDraft
): DropshipPackageCreateInfo | null {
  const line = draft.lines.find((l) => l.lineId === draft.selectedLineId);
  if (!line) return null;
  return {
    lineId: line.lineId,
    lineName: line.lineName,
    deliveryTime: line.deliveryTime,
    packageComment: "",
    packageChoosedContent: {
      currency: draft.declareCurrency || "USD",
      couponId: "",
      passwordDiscount: "",
      incrementList: packagingToIncrementList(draft.packaging),
      insure: 0,
      useInsure: 0,
      queryForm: {
        declareMode: draft.declareMode,
        registrationType: draft.registrationType,
        tax: draft.tax,
        currency: draft.declareCurrency || "USD",
        ...(draft.registrationType === 4 && draft.taxNo.trim()
          ? { taxNo: draft.taxNo.trim() }
          : {}),
      },
    },
  };
}
