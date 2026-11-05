import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import { getShopSupplierLinkView, type ShopSupplierLinkView } from "./shop-supplier.server";
import { isVendorAgreementComplete } from "./vendor-agreement.server";
import { w9FormViewFromShop } from "./w9-form.server";

export type OnboardingChecklistItem = {
  id: "store-domain" | "vendor-agreement" | "w9" | "payout-bank" | "catalog-submit";
  step: number;
  label: string;
  complete: boolean;
  href: string;
};

export type OnboardingChecklist = {
  items: OnboardingChecklistItem[];
  completedCount: number;
  totalCount: number;
  allComplete: boolean;
};

function payoutBankComplete(shop: Shop | null): boolean {
  return shop?.stripeConnectOnboardingStatus === "complete";
}

export function buildOnboardingChecklist(input: {
  shop: Shop | null;
  supplier: ShopSupplierLinkView;
  importedProductCount: number;
  vendorAgreementComplete?: boolean;
}): OnboardingChecklist {
  const w9 = w9FormViewFromShop(input.shop);

  const items: OnboardingChecklistItem[] = [
    {
      id: "store-domain",
      step: 1,
      label: "Connect Your Store Domain",
      complete: input.supplier.approvalStatus === "approved",
      href: "/app/settings?section=shopify",
    },
    {
      id: "vendor-agreement",
      step: 2,
      label: "Sign the Vendor Agreement",
      complete:
        input.vendorAgreementComplete ?? isVendorAgreementComplete(input.shop),
      href: "/app/settings?section=vendor-agreement",
    },
    {
      id: "w9",
      step: 3,
      label: "Submit a W-9 Form",
      complete: w9.uploaded,
      href: "/app/settings?section=w9",
    },
    {
      id: "payout-bank",
      step: 4,
      label: "Connect Bank Account for Payouts",
      complete: payoutBankComplete(input.shop),
      href: "/app/settings?section=payout",
    },
    {
      id: "catalog-submit",
      step: 5,
      label: "Select Products and Submit With Ethos",
      complete: input.importedProductCount > 0,
      href: input.importedProductCount > 0 ? "/app/submissions" : "/app/products",
    },
  ];

  const completedCount = items.filter((item) => item.complete).length;
  return {
    items,
    completedCount,
    totalCount: items.length,
    allComplete: completedCount === items.length,
  };
}

export async function loadOnboardingChecklist(
  shopDomain: string,
  previewMode: boolean,
): Promise<OnboardingChecklist> {
  const [shop, supplier, importedProductCount] = await Promise.all([
    prisma.shop.findUnique({ where: { shopDomain } }),
    getShopSupplierLinkView(shopDomain, { previewMode }),
    prisma.shopifyProductMap.count({ where: { shopDomain } }),
  ]);

  return buildOnboardingChecklist({ shop, supplier, importedProductCount });
}
