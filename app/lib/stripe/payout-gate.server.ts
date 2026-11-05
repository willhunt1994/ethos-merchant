import type { Shop } from "@prisma/client";
import prisma from "../../db.server";
import type { ConnectOnboardingStatus, StripeRequirementsSnapshot } from "./connect.server";

export type PayoutStatusLabel =
  | "Not started"
  | "Action required"
  | "Connected"
  | "Paused by Ethos"
  | "Restricted";

export type PayoutReadiness = {
  configured: boolean;
  stripeConnectAccountId: string | null;
  onboardingStatus: ConnectOnboardingStatus;
  stripePayoutsEnabled: boolean;
  ethosPayoutsEnabled: boolean;
  stripeReady: boolean;
  effective: boolean;
  statusLabel: PayoutStatusLabel;
  requirementsDue: StripeRequirementsSnapshot | null;
  syncedAt: string | null;
  w9Complete: boolean;
};

function onboardingStatusFromShop(shop: Shop): ConnectOnboardingStatus {
  const raw = shop.stripeConnectOnboardingStatus;
  if (raw === "pending" || raw === "complete" || raw === "restricted") {
    return raw;
  }
  if (shop.stripeConnectAccountId) return "pending";
  return "not_started";
}

function requirementsFromShop(shop: Shop): StripeRequirementsSnapshot | null {
  if (!shop.stripeRequirementsDue || typeof shop.stripeRequirementsDue !== "object") {
    return null;
  }
  const r = shop.stripeRequirementsDue as StripeRequirementsSnapshot;
  return {
    currentlyDue: Array.isArray(r.currentlyDue) ? r.currentlyDue : [],
    eventuallyDue: Array.isArray(r.eventuallyDue) ? r.eventuallyDue : [],
    pastDue: Array.isArray(r.pastDue) ? r.pastDue : [],
    disabledReason: typeof r.disabledReason === "string" ? r.disabledReason : null,
    errors: Array.isArray(r.errors) ? r.errors : [],
  };
}

export function payoutReadinessFromShop(shop: Shop, stripeConfigured: boolean): PayoutReadiness {
  const onboardingStatus = onboardingStatusFromShop(shop);
  const stripePayoutsEnabled = shop.stripePayoutsEnabled === true;
  const ethosPayoutsEnabled = shop.ethosPayoutsEnabled === true;
  const stripeReady = stripePayoutsEnabled && onboardingStatus === "complete";
  const effective = stripeReady && ethosPayoutsEnabled;
  const requirementsDue = requirementsFromShop(shop);
  const hasOpenRequirements =
    (requirementsDue?.currentlyDue.length ?? 0) > 0 ||
    (requirementsDue?.pastDue.length ?? 0) > 0 ||
    onboardingStatus === "restricted";

  let statusLabel: PayoutStatusLabel = "Not started";
  if (onboardingStatus === "restricted") {
    statusLabel = "Restricted";
  } else if (stripeReady && !ethosPayoutsEnabled) {
    statusLabel = "Paused by Ethos";
  } else if (stripeReady) {
    statusLabel = "Connected";
  } else if (shop.stripeConnectAccountId || hasOpenRequirements) {
    statusLabel = "Action required";
  }

  const w9Complete = Boolean(
    shop.w9LegalBusinessName?.trim() && shop.w9BusinessAddress?.trim(),
  );

  return {
    configured: stripeConfigured,
    stripeConnectAccountId: shop.stripeConnectAccountId,
    onboardingStatus,
    stripePayoutsEnabled,
    ethosPayoutsEnabled,
    stripeReady,
    effective,
    statusLabel,
    requirementsDue,
    syncedAt: shop.stripeConnectSyncedAt?.toISOString() ?? null,
    w9Complete,
  };
}

export async function getPayoutReadiness(shopDomain: string): Promise<PayoutReadiness> {
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    return payoutReadinessFromShop(
      {
        id: "",
        shopDomain,
        installedAt: new Date(),
        uninstalledAt: null,
        lastSyncAt: null,
        w9LegalBusinessName: null,
        w9BusinessAddress: null,
        w9FormStorageKey: null,
        w9FormFilename: null,
        w9FormContentType: null,
        w9FormUploadedAt: null,
        w9FormVerifiedAt: null,
        stripeConnectAccountId: null,
        stripeConnectOnboardingStatus: null,
        stripePayoutsEnabled: null,
        stripeRequirementsDue: null,
        ethosPayoutsEnabled: false,
        ethosPayoutsNote: null,
        stripeConnectSyncedAt: null,
        quantityBreakTiers: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      stripeConfigured,
    );
  }
  return payoutReadinessFromShop(shop, stripeConfigured);
}
