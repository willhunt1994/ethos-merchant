import type { Shop } from "@prisma/client";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { CURRENT_VENDOR_AGREEMENT_VERSION } from "./vendor-agreement-content";
import {
  isScheduleAComplete,
  scheduleAFromShop,
  type VendorAgreementScheduleA,
} from "./vendor-agreement-schedule-a";
import {
  isVendorAgreementComplete,
  vendorAgreementViewFromShop,
  type VendorAgreementView,
} from "./vendor-agreement.server";

export type VendorAgreementSnapshot = {
  shopDomain: string;
  agreement: VendorAgreementView;
  scheduleA: VendorAgreementScheduleA;
  scheduleAComplete: boolean;
  vendorSigned: boolean;
  vendorAgreementComplete: boolean;
  ethosCounterSigned: boolean;
  fullyExecuted: boolean;
  ethosSignedAt: string | null;
  ethosSignatoryName: string | null;
  ethosSignatoryTitle: string | null;
  ethosSignedByUserRef: string | null;
  installedAt: string | null;
};

export function ethosCounterSignedOnShop(shop: Shop | null): boolean {
  return Boolean(shop?.vendorAgreementEthosSignedAt);
}

export function isVendorAgreementFullyExecuted(shop: Shop | null): boolean {
  if (!isVendorAgreementComplete(shop)) return false;
  if (!isScheduleAComplete(scheduleAFromShop(shop))) return false;
  return ethosCounterSignedOnShop(shop);
}

export function toVendorAgreementSnapshot(shop: Shop): VendorAgreementSnapshot {
  const agreement = vendorAgreementViewFromShop(shop);
  const scheduleA = scheduleAFromShop(shop);
  const vendorAgreementComplete = isVendorAgreementComplete(shop);
  const ethosCounterSigned = ethosCounterSignedOnShop(shop);
  return {
    shopDomain: shop.shopDomain,
    agreement,
    scheduleA,
    scheduleAComplete: isScheduleAComplete(scheduleA),
    vendorSigned: agreement.isSigned && agreement.isCurrentVersion,
    vendorAgreementComplete,
    ethosCounterSigned,
    fullyExecuted: vendorAgreementComplete && isScheduleAComplete(scheduleA) && ethosCounterSigned,
    ethosSignedAt: shop.vendorAgreementEthosSignedAt?.toISOString() ?? null,
    ethosSignatoryName: shop.vendorAgreementEthosSignatoryName?.trim() || null,
    ethosSignatoryTitle: shop.vendorAgreementEthosSignatoryTitle?.trim() || null,
    ethosSignedByUserRef: shop.vendorAgreementEthosSignedByRef?.trim() || null,
    installedAt: shop.installedAt?.toISOString() ?? null,
  };
}

export async function getVendorAgreementSnapshot(
  shopDomain: string,
): Promise<VendorAgreementSnapshot | null> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: shopDomain.trim().toLowerCase() },
  });
  if (!shop) return null;
  return toVendorAgreementSnapshot(shop);
}

export async function listVendorAgreementSnapshots(options?: {
  limit?: number;
}): Promise<VendorAgreementSnapshot[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const shops = await prisma.shop.findMany({
    where: {
      vendorAgreementSignedAt: { not: null },
    },
    orderBy: { vendorAgreementSignedAt: "desc" },
    take: limit,
  });
  return shops.map((s) => toVendorAgreementSnapshot(s));
}

export async function recordEthosVendorAgreementCounterSign(input: {
  shopDomain: string;
  signatoryName: string;
  signatoryTitle: string;
  signedByUserRef?: string | null;
  requestMeta?: { ip?: string | null; userAgent?: string | null };
}): Promise<VendorAgreementSnapshot> {
  const shopDomain = input.shopDomain.trim().toLowerCase();
  const signatoryName = input.signatoryName.trim();
  const signatoryTitle = input.signatoryTitle.trim();
  if (!signatoryName) throw new Error("Ethos signatory name is required");
  if (!signatoryTitle) throw new Error("Ethos signatory title is required");

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Error("Shop not found");
  if (!isVendorAgreementComplete(shop)) {
    throw new Error("Vendor has not signed the current agreement version");
  }
  if (!isScheduleAComplete(scheduleAFromShop(shop))) {
    throw new Error("Schedule A is incomplete on this shop");
  }

  const signedAt = new Date();
  const audit = {
    agreementVersion: shop.vendorAgreementVersion ?? CURRENT_VENDOR_AGREEMENT_VERSION,
    signedAt: signedAt.toISOString(),
    ip: input.requestMeta?.ip ?? null,
    userAgent: input.requestMeta?.userAgent ?? null,
    signedByUserRef: input.signedByUserRef?.trim() || null,
  };

  const updated = await prisma.shop.update({
    where: { shopDomain },
    data: {
      vendorAgreementEthosSignedAt: signedAt,
      vendorAgreementEthosSignatoryName: signatoryName,
      vendorAgreementEthosSignatoryTitle: signatoryTitle,
      vendorAgreementEthosSignedByRef: input.signedByUserRef?.trim() || null,
      vendorAgreementEthosSignAudit: audit,
    },
  });

  return toVendorAgreementSnapshot(updated);
}

export async function clearEthosVendorAgreementCounterSign(
  shopDomain: string,
): Promise<VendorAgreementSnapshot> {
  const normalized = shopDomain.trim().toLowerCase();
  const updated = await prisma.shop.update({
    where: { shopDomain: normalized },
    data: {
      vendorAgreementEthosSignedAt: null,
      vendorAgreementEthosSignatoryName: null,
      vendorAgreementEthosSignatoryTitle: null,
      vendorAgreementEthosSignedByRef: null,
      vendorAgreementEthosSignAudit: Prisma.JsonNull,
    },
  });
  return toVendorAgreementSnapshot(updated);
}
