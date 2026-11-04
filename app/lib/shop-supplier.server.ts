import type { ShopSupplierApprovalStatus } from "@prisma/client";
import prisma from "../db.server";
import { PREVIEW_SHOP_DOMAIN } from "./local-preview.server";
import { isLocalPreviewEnabled } from "../config/env.server";

export type ShopSupplierLinkView = {
  ethosSupplierSlug: string | null;
  ethosSupplierId: number | null;
  approvalStatus: ShopSupplierApprovalStatus | "none";
  approvedAt: string | null;
  approvedByUserRef: string | null;
  canSubmit: boolean;
};

export async function ensureShopRecord(shopDomain: string) {
  return prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain },
    update: {},
  });
}

export async function upsertShopSupplierLink(input: {
  shopDomain: string;
  ethosSupplierId: number;
  ethosSupplierSlug: string;
  approvalStatus: ShopSupplierApprovalStatus;
  approvedByUserRef?: string | null;
}) {
  const slug = input.ethosSupplierSlug.trim().toLowerCase();
  if (!slug) {
    throw new Error("ethosSupplierSlug is required");
  }
  if (!Number.isInteger(input.ethosSupplierId) || input.ethosSupplierId <= 0) {
    throw new Error("ethosSupplierId must be a positive integer");
  }

  const shop = await ensureShopRecord(input.shopDomain);
  const approvedAt = input.approvalStatus === "approved" ? new Date() : null;

  return prisma.shopSupplierLink.upsert({
    where: {
      shopId_ethosSupplierSlug: { shopId: shop.id, ethosSupplierSlug: slug },
    },
    create: {
      shopId: shop.id,
      ethosSupplierId: input.ethosSupplierId,
      ethosSupplierSlug: slug,
      approvalStatus: input.approvalStatus,
      approvedAt,
      approvedByUserRef: input.approvedByUserRef ?? null,
    },
    update: {
      ethosSupplierId: input.ethosSupplierId,
      approvalStatus: input.approvalStatus,
      approvedAt,
      approvedByUserRef: input.approvedByUserRef ?? null,
    },
  });
}

export async function getPrimaryShopSupplierLink(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      supplierLinks: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  return shop?.supplierLinks[0] ?? null;
}

export async function getShopSupplierLinkView(
  shopDomain: string,
  options?: { previewMode?: boolean },
): Promise<ShopSupplierLinkView> {
  if (options?.previewMode || (isLocalPreviewEnabled() && shopDomain === PREVIEW_SHOP_DOMAIN)) {
    return {
      ethosSupplierSlug: "preview-supplier",
      ethosSupplierId: 0,
      approvalStatus: "approved",
      approvedAt: null,
      approvedByUserRef: null,
      canSubmit: true,
    };
  }

  const link = await getPrimaryShopSupplierLink(shopDomain);
  if (!link) {
    return {
      ethosSupplierSlug: null,
      ethosSupplierId: null,
      approvalStatus: "none",
      approvedAt: null,
      approvedByUserRef: null,
      canSubmit: false,
    };
  }

  return {
    ethosSupplierSlug: link.ethosSupplierSlug,
    ethosSupplierId: link.ethosSupplierId,
    approvalStatus: link.approvalStatus,
    approvedAt: link.approvedAt?.toISOString() ?? null,
    approvedByUserRef: link.approvedByUserRef,
    canSubmit: link.approvalStatus === "approved",
  };
}

/** Dev-only: link OAuth shop to a supplier when env matches (see .env.example). */
export async function maybeApplyDevSupplierLink(shopDomain: string): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  const targetShop = process.env.ETHOS_DEV_SHOP_DOMAIN?.trim();
  const slug = process.env.ETHOS_DEV_SUPPLIER_SLUG?.trim().toLowerCase();
  const idRaw = process.env.ETHOS_DEV_SUPPLIER_ID?.trim();
  if (!slug || !idRaw) return;
  if (targetShop && targetShop !== shopDomain) return;

  const ethosSupplierId = Number(idRaw);
  if (!Number.isInteger(ethosSupplierId) || ethosSupplierId <= 0) return;

  const approvalStatus: ShopSupplierApprovalStatus =
    process.env.ETHOS_DEV_AUTO_APPROVE_SUPPLIER === "1" ? "approved" : "pending";

  await upsertShopSupplierLink({
    shopDomain,
    ethosSupplierId,
    ethosSupplierSlug: slug,
    approvalStatus,
    approvedByUserRef: approvalStatus === "approved" ? "dev:auto" : null,
  });
}
