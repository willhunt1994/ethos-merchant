import type { Shop } from "@prisma/client";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import prisma from "../../db.server";
import { parseW9BusinessAddress } from "../w9-address";

export type ConnectOnboardingStatus = "not_started" | "pending" | "complete" | "restricted";

export type StripeRequirementsSnapshot = {
  currentlyDue: string[];
  eventuallyDue: string[];
  pastDue: string[];
  disabledReason: string | null;
  errors: Array<{ code: string; reason: string }>;
};

function stripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function isStripeConnectConfigured(): boolean {
  return Boolean(stripeSecretKey());
}

export function requireStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}

function connectReturnUrl(): string {
  const explicit = process.env.STRIPE_CONNECT_RETURN_URL?.trim();
  if (explicit) return explicit;
  const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/+$/, "");
  if (!appUrl) {
    throw new Error("SHOPIFY_APP_URL or STRIPE_CONNECT_RETURN_URL must be set for Connect onboarding");
  }
  return `${appUrl}/app/settings?payout=return`;
}

function connectRefreshUrl(): string {
  const base = connectReturnUrl();
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}refresh=1`;
}

export function mapAccountToOnboardingStatus(account: Stripe.Account): ConnectOnboardingStatus {
  if (account.requirements?.disabled_reason) {
    return "restricted";
  }
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;
  if (payoutsEnabled && detailsSubmitted) {
    return "complete";
  }
  if (account.id) {
    return "pending";
  }
  return "not_started";
}

export function requirementsSnapshot(account: Stripe.Account): StripeRequirementsSnapshot {
  const req = account.requirements;
  return {
    currentlyDue: req?.currently_due ?? [],
    eventuallyDue: req?.eventually_due ?? [],
    pastDue: req?.past_due ?? [],
    disabledReason: req?.disabled_reason ?? null,
    errors: (req?.errors ?? []).map((e) => ({
      code: e.code ?? "unknown",
      reason: e.reason ?? "Requirement error",
    })),
  };
}

export type ShopStripeConnectPatch = {
  stripeConnectAccountId?: string | null;
  stripeConnectOnboardingStatus: ConnectOnboardingStatus;
  stripePayoutsEnabled: boolean | null;
  stripeRequirementsDue: StripeRequirementsSnapshot | null;
  stripeConnectSyncedAt: Date;
};

export function patchFromStripeAccount(account: Stripe.Account): ShopStripeConnectPatch {
  return {
    stripeConnectAccountId: account.id,
    stripeConnectOnboardingStatus: mapAccountToOnboardingStatus(account),
    stripePayoutsEnabled: account.payouts_enabled ?? null,
    stripeRequirementsDue: requirementsSnapshot(account),
    stripeConnectSyncedAt: new Date(),
  };
}

export async function applyStripeAccountToShop(
  shopDomain: string,
  account: Stripe.Account,
): Promise<void> {
  const patch = patchFromStripeAccount(account);
  await prisma.shop.update({
    where: { shopDomain },
    data: {
      ...patch,
      stripeRequirementsDue:
        patch.stripeRequirementsDue === null
          ? Prisma.JsonNull
          : (patch.stripeRequirementsDue as Prisma.InputJsonValue),
    },
  });
}

export async function applyStripeAccountByConnectId(account: Stripe.Account): Promise<void> {
  const shopDomain =
    account.metadata?.shopDomain?.trim().toLowerCase() ||
    (await prisma.shop.findFirst({
      where: { stripeConnectAccountId: account.id },
      select: { shopDomain: true },
    }))?.shopDomain;

  if (!shopDomain) {
    console.warn(`Stripe Connect account ${account.id} has no matching shop`);
    return;
  }

  await applyStripeAccountToShop(shopDomain, account);
}

export async function prefillConnectAccountFromW9(shop: Shop, accountId: string): Promise<void> {
  const stripe = requireStripe();
  const name = shop.w9LegalBusinessName?.trim();
  const addr = parseW9BusinessAddress(shop.w9BusinessAddress);
  const line1 = [addr.addressLine1, addr.addressLine2].filter(Boolean).join(", ");
  if (!name && !line1) return;

  await stripe.accounts.update(accountId, {
    business_type: "company",
    business_profile: name ? { name } : undefined,
    company: {
      ...(name ? { name } : {}),
      ...(line1
        ? {
            address: {
              line1,
              city: addr.city || undefined,
              state: addr.state || undefined,
              postal_code: addr.postalCode || undefined,
              country: "US",
            },
          }
        : {}),
    },
  });
}

export async function ensureExpressAccount(shop: Shop): Promise<string> {
  const stripe = requireStripe();
  if (shop.stripeConnectAccountId) {
    return shop.stripeConnectAccountId;
  }

  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    capabilities: {
      transfers: { requested: true },
    },
    metadata: {
      shopDomain: shop.shopDomain,
    },
  });

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      stripeConnectAccountId: account.id,
      stripeConnectOnboardingStatus: "pending",
    },
  });

  return account.id;
}

export async function refreshConnectAccountForShop(shopDomain: string): Promise<Shop> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { shopDomain } });
  if (!shop.stripeConnectAccountId) {
    return shop;
  }
  const stripe = requireStripe();
  const account = await stripe.accounts.retrieve(shop.stripeConnectAccountId);
  await applyStripeAccountToShop(shopDomain, account);
  return prisma.shop.findUniqueOrThrow({ where: { shopDomain } });
}

export async function createConnectOnboardingLink(shop: Shop): Promise<string> {
  const stripe = requireStripe();
  const accountId = await ensureExpressAccount(shop);
  await prefillConnectAccountFromW9(shop, accountId);

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: connectReturnUrl(),
    refresh_url: connectRefreshUrl(),
  });

  if (!link.url) {
    throw new Error("Stripe did not return an onboarding URL");
  }
  return link.url;
}

export async function createConnectUpdateLink(shop: Shop): Promise<string> {
  const stripe = requireStripe();
  const accountId = shop.stripeConnectAccountId;
  if (!accountId) {
    return createConnectOnboardingLink(shop);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: connectReturnUrl(),
    refresh_url: connectRefreshUrl(),
  });

  if (!link.url) {
    throw new Error("Stripe did not return an account update URL");
  }
  return link.url;
}
