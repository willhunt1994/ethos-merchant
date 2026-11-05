import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { payoutReadinessFromShop, type PayoutReadiness } from "./stripe/payout-gate.server";
import { w9FormViewFromShop, type W9FormView } from "./w9-form.server";

export type ShopPayoutSnapshot = PayoutReadiness & {
  shopDomain: string;
  ethosPayoutsNote: string | null;
  installedAt: string | null;
  uninstalledAt: string | null;
  w9Form: W9FormView;
};

function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function toShopPayoutSnapshot(shop: Shop): ShopPayoutSnapshot {
  return {
    ...payoutReadinessFromShop(shop, stripeConfigured()),
    shopDomain: shop.shopDomain,
    ethosPayoutsNote: shop.ethosPayoutsNote,
    installedAt: shop.installedAt?.toISOString() ?? null,
    uninstalledAt: shop.uninstalledAt?.toISOString() ?? null,
    w9Form: w9FormViewFromShop(shop),
  };
}

export async function listShopPayoutSnapshots(options?: {
  shopDomain?: string;
  limit?: number;
}): Promise<ShopPayoutSnapshot[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const shopDomain = options?.shopDomain?.trim().toLowerCase();

  const shops = await prisma.shop.findMany({
    where: shopDomain ? { shopDomain } : undefined,
    orderBy: { shopDomain: "asc" },
    take: limit,
  });

  return shops.map((s) => toShopPayoutSnapshot(s));
}

export async function getShopPayoutSnapshot(shopDomain: string): Promise<ShopPayoutSnapshot | null> {
  const shop = await prisma.shop.findUnique({ where: { shopDomain: shopDomain.trim().toLowerCase() } });
  if (!shop) return null;
  return toShopPayoutSnapshot(shop);
}

export async function updateEthosPayoutControl(input: {
  shopDomain: string;
  ethosPayoutsEnabled?: boolean;
  ethosPayoutsNote?: string | null;
  w9FormVerified?: boolean;
}): Promise<ShopPayoutSnapshot> {
  const shopDomain = input.shopDomain.trim().toLowerCase();
  const data: {
    ethosPayoutsEnabled?: boolean;
    ethosPayoutsNote?: string | null;
    w9FormVerifiedAt?: Date | null;
  } = {};
  if (typeof input.ethosPayoutsEnabled === "boolean") {
    data.ethosPayoutsEnabled = input.ethosPayoutsEnabled;
  }
  if (input.ethosPayoutsNote !== undefined) {
    data.ethosPayoutsNote = input.ethosPayoutsNote?.trim() || null;
  }
  if (typeof input.w9FormVerified === "boolean") {
    data.w9FormVerifiedAt = input.w9FormVerified ? new Date() : null;
  }

  const shop = await prisma.shop.upsert({
    where: { shopDomain },
    create: { shopDomain, ...data },
    update: data,
  });

  return toShopPayoutSnapshot(shop);
}
