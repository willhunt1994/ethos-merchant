import prisma from "../db.server";
import { countSelectedProducts } from "./product-selection.server";
import { buildOnboardingChecklist } from "./onboarding-checklist.server";
import { getShopSupplierLinkView } from "./shop-supplier.server";
import { resolveVendorAgreementState } from "./vendor-agreement-preview-mock.server";

export async function loadAppDashboard(
  shopDomain: string,
  previewMode: boolean,
  request?: Request,
) {
  const shopPromise = prisma.shop.findUnique({ where: { shopDomain } });
  const [shop, supplier, selectedCount, importedCount, submissionCount, selections] =
    await Promise.all([
    shopPromise,
    getShopSupplierLinkView(shopDomain, { previewMode }),
    countSelectedProducts(shopDomain),
    prisma.shopifyProductMap.count({ where: { shopDomain } }),
    prisma.submission.count({ where: { shopDomain } }),
    prisma.productSelection.findMany({
      where: { shopDomain },
      include: { variantSelections: { where: { selected: true } } },
    }),
  ]);

  const vendorAgreementComplete = previewMode && request
    ? resolveVendorAgreementState(request, shop, true).vendorAgreementComplete
    : undefined;

  const onboardingChecklist = buildOnboardingChecklist({
    shop,
    supplier,
    importedProductCount: importedCount,
    vendorAgreementComplete,
  });

  const importedGids = new Set(
    (
      await prisma.shopifyProductMap.findMany({
        where: { shopDomain },
        select: { shopifyProductGid: true },
      })
    ).map((m) => m.shopifyProductGid),
  );

  let readyToSubmit = 0;
  let needsPricing = 0;
  for (const sel of selections) {
    if (importedGids.has(sel.shopifyProductGid)) continue;
    const variants = sel.variantSelections;
    if (variants.length === 0) continue;
    const priced = variants.filter((v) => v.ethosPrice != null && Number(v.ethosPrice) > 0);
    if (priced.length === variants.length) readyToSubmit += 1;
    else needsPricing += 1;
  }

  const lastSubmission = await prisma.submission.findFirst({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true },
  });

  return {
    supplier,
    selectedCount,
    importedCount,
    submissionCount,
    readyToSubmit,
    needsPricing,
    lastSubmission,
    onboardingChecklist,
  };
}
