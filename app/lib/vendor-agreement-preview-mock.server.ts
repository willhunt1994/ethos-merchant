import type { Shop } from "@prisma/client";
import { isLocalPreviewEnabled } from "../config/env.server";
import { CURRENT_VENDOR_AGREEMENT_VERSION } from "./vendor-agreement-content";
import {
  CURRENT_SCHEDULE_A_VERSION,
  type VendorAgreementScheduleA,
} from "./vendor-agreement-schedule-a";
import {
  isVendorAgreementComplete,
  vendorAgreementViewFromShop,
  type VendorAgreementView,
} from "./vendor-agreement.server";
import { isVendorAgreementFullyExecuted as ethosFullyExecutedFromShop } from "./shop-vendor-agreement.server";
import {
  PREVIEW_VENDOR_EXECUTED_PARAM,
  PREVIEW_VENDOR_SIGNED_PARAM,
  type VendorAgreementPreviewFlags,
} from "./vendor-agreement-preview-mock";

export type { VendorAgreementPreviewFlags };

export function vendorAgreementPreviewFlags(request: Request): VendorAgreementPreviewFlags {
  if (!isLocalPreviewEnabled()) {
    return { mockSigned: false, mockFullyExecuted: false };
  }
  const params = new URL(request.url).searchParams;
  const mockSigned = params.get(PREVIEW_VENDOR_SIGNED_PARAM) === "1";
  const mockFullyExecuted = mockSigned && params.get(PREVIEW_VENDOR_EXECUTED_PARAM) === "1";
  return { mockSigned, mockFullyExecuted };
}

function mockScheduleA(): VendorAgreementScheduleA {
  return {
    version: CURRENT_SCHEDULE_A_VERSION,
    termsAccepted: true,
    additionalTerms: "",
  };
}

export function vendorAgreementViewWithPreviewMock(
  shop: Shop | null,
  flags: VendorAgreementPreviewFlags,
  previewMode: boolean,
): VendorAgreementView {
  const base = vendorAgreementViewFromShop(shop);
  if (!previewMode || !flags.mockSigned) return base;

  const signedAt = new Date().toISOString();
  const scheduleA = mockScheduleA();
  const ethosSignedAt = flags.mockFullyExecuted ? signedAt : null;

  return {
    ...base,
    signatoryName: base.signatoryName || "Preview Signatory",
    signatoryTitle: base.signatoryTitle || "Owner",
    signatureText: base.signatureText || "Preview Signatory",
    version: CURRENT_VENDOR_AGREEMENT_VERSION,
    signedAt,
    isSigned: true,
    isCurrentVersion: true,
    scheduleA,
    scheduleAComplete: true,
    ethosSignedAt,
    ethosSignatoryName: flags.mockFullyExecuted ? "Ethos Operations" : null,
    ethosSignatoryTitle: flags.mockFullyExecuted ? "Authorized Representative" : null,
    pendingEthosCounterSign: !flags.mockFullyExecuted,
    fullyExecuted: flags.mockFullyExecuted,
  };
}

export type ResolvedVendorAgreementState = {
  agreement: VendorAgreementView;
  vendorAgreementComplete: boolean;
  vendorAgreementFullyExecuted: boolean;
  previewFlags: VendorAgreementPreviewFlags;
};

export function resolveVendorAgreementState(
  request: Request,
  shop: Shop | null,
  previewMode: boolean,
): ResolvedVendorAgreementState {
  const previewFlags = vendorAgreementPreviewFlags(request);
  const agreement = vendorAgreementViewWithPreviewMock(shop, previewFlags, previewMode);

  if (previewMode) {
    return {
      agreement,
      vendorAgreementComplete: previewFlags.mockSigned,
      vendorAgreementFullyExecuted: previewFlags.mockFullyExecuted,
      previewFlags,
    };
  }

  return {
    agreement,
    vendorAgreementComplete: isVendorAgreementComplete(shop),
    vendorAgreementFullyExecuted: ethosFullyExecutedFromShop(shop),
    previewFlags,
  };
}
