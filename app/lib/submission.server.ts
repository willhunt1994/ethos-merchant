import { Decimal } from "@prisma/client/runtime/library";
import prisma from "../db.server";
import type { MerchantContext } from "./merchant-auth.server";
import { importProductToEthos, type EthosImportProductPayload } from "./ethos-integration.server";
import { fetchConfigureVariants } from "./shopify/variants.server";
import { fetchProductSummariesByGids } from "./shopify/products.server";
import { getShopSupplierLinkView } from "./shop-supplier.server";
import { resolveVendorAgreementState } from "./vendor-agreement-preview-mock.server";
import { MOCK_CATALOG_PRODUCTS } from "./mock-catalog";
import {
  parseFilledQuantityTierStrings,
  primaryEthosPriceFromTierStrings,
  quantityTierStringsFromStorage,
  variantPricingCompleteForProduct,
} from "./quantity-pricing";
import { hasRequiredCustomizationTypes } from "./product-customization-types";
import { getShopQuantityBreakTiers } from "./shop-quantity-tiers.server";

export type SubmitSelectionResult = {
  ok: boolean;
  submissionId?: string;
  imported: number;
  failed: number;
  skipped: number;
  errors: string[];
};

function decimalToNumber(value: Decimal | null | undefined): number | null {
  if (value == null) return null;
  return Number(value.toString());
}

export async function submitSelectedProducts(
  ctx: MerchantContext,
  request: Request,
): Promise<SubmitSelectionResult> {
  const supplier = await getShopSupplierLinkView(ctx.shopDomain, {
    previewMode: ctx.mode === "preview",
  });

  if (!supplier.canSubmit || !supplier.ethosSupplierSlug) {
    return { ok: false, imported: 0, failed: 0, skipped: 0, errors: ["Supplier is not approved for submission."] };
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
  const { vendorAgreementComplete } = resolveVendorAgreementState(
    request,
    shop,
    ctx.mode === "preview",
  );
  if (!vendorAgreementComplete) {
    return {
      ok: false,
      imported: 0,
      failed: 0,
      skipped: 0,
      errors: [
        "Vendor agreement and Schedule A must be completed in Settings before submitting products.",
      ],
    };
  }

  const supplierSlug = supplier.ethosSupplierSlug;

  const selections = await prisma.productSelection.findMany({
    where: { shopDomain: ctx.shopDomain },
    include: {
      variantSelections: { where: { selected: true } },
      attachments: { where: { status: "uploaded" } },
    },
    orderBy: { updatedAt: "asc" },
  });

  if (selections.length === 0) {
    return { ok: false, imported: 0, failed: 0, skipped: 0, errors: ["No products in your selection."] };
  }

  const idempotencyKey = `batch-${ctx.shopDomain}-${Date.now()}`;
  const submission = await prisma.submission.create({
    data: {
      shopDomain: ctx.shopDomain,
      idempotencyKey,
      status: "processing",
      submittedAt: new Date(),
    },
  });

  const errors: string[] = [];
  let imported = 0;
  let failed = 0;
  let skipped = 0;

  const mockById = new Map(MOCK_CATALOG_PRODUCTS.map((p) => [p.id, p]));
  const quantityBreakTiers = await getShopQuantityBreakTiers(ctx.shopDomain);
  const baseTierLabel = quantityBreakTiers[0]?.label ?? "base tier";

  for (const sel of selections) {
    const existingMap = await prisma.shopifyProductMap.findUnique({
      where: {
        shopDomain_shopifyProductGid: {
          shopDomain: ctx.shopDomain,
          shopifyProductGid: sel.shopifyProductGid,
        },
      },
    });

    if (existingMap) {
      skipped += 1;
      await prisma.submissionLine.create({
        data: {
          submissionId: submission.id,
          shopifyProductGid: sel.shopifyProductGid,
          shopifyVariantGids: sel.variantSelections.map((v) => v.shopifyVariantGid),
          status: "imported",
          errorMessage: `Already imported as ${existingMap.itemCode}`,
        },
      });
      continue;
    }

    const variantRows = sel.variantSelections;
    if (variantRows.length === 0) {
      failed += 1;
      const msg = "No variants selected";
      errors.push(`${sel.shopifyProductGid}: ${msg}`);
      await prisma.submissionLine.create({
        data: {
          submissionId: submission.id,
          shopifyProductGid: sel.shopifyProductGid,
          shopifyVariantGids: [],
          status: "failed",
          errorMessage: msg,
        },
      });
      continue;
    }

    const missingPrice = variantRows.filter((v) => {
      const tiers = quantityTierStringsFromStorage(
        v.ethosQuantityPricing,
        v.ethosPrice?.toString(),
        quantityBreakTiers,
      );
      return !variantPricingCompleteForProduct(
        tiers,
        sel.offerQuantityDiscounts,
        quantityBreakTiers,
      );
    });
    if (missingPrice.length > 0) {
      failed += 1;
      const msg = sel.offerQuantityDiscounts
        ? `Set at least the ${baseTierLabel} price on every selected variant before submitting`
        : "Set Ethos price on every selected variant before submitting";
      errors.push(`${sel.shopifyProductGid}: ${msg}`);
      await prisma.submissionLine.create({
        data: {
          submissionId: submission.id,
          shopifyProductGid: sel.shopifyProductGid,
          shopifyVariantGids: variantRows.map((v) => v.shopifyVariantGid),
          status: "needs_attention",
          errorMessage: msg,
        },
      });
      continue;
    }

    if (!hasRequiredCustomizationTypes(sel.offerCustomization, sel.customizationTypeIds)) {
      failed += 1;
      const msg = "Select at least one customization type before submitting";
      errors.push(`${sel.shopifyProductGid}: ${msg}`);
      await prisma.submissionLine.create({
        data: {
          submissionId: submission.id,
          shopifyProductGid: sel.shopifyProductGid,
          shopifyVariantGids: variantRows.map((v) => v.shopifyVariantGid),
          status: "needs_attention",
          errorMessage: msg,
        },
      });
      continue;
    }

    let title = mockById.get(sel.shopifyProductGid)?.title ?? sel.shopifyProductGid;
    let productType: string | null = null;
    const variantMeta = new Map<
      string,
      { color: string; size: string; sku: string | null; quantity: number }
    >();

    if (ctx.mode === "shopify" && ctx.admin) {
      const summaries = await fetchProductSummariesByGids(ctx.admin, [sel.shopifyProductGid]);
      title = summaries.get(sel.shopifyProductGid)?.title ?? title;
      try {
        const fetched = await fetchConfigureVariants(ctx.admin, sel.shopifyProductGid);
        productType = fetched.productType;
        for (const v of fetched.variants) {
          variantMeta.set(v.id, {
            color: v.color,
            size: v.size,
            sku: v.sku,
            quantity: v.inventoryQuantity,
          });
        }
      } catch (e) {
        console.warn("[submit] variant fetch failed", e);
      }
    }

    const ethosPrices = variantRows.map((v) => {
      const tierStrings = quantityTierStringsFromStorage(
        v.ethosQuantityPricing,
        v.ethosPrice?.toString(),
        quantityBreakTiers,
      );
      return Number(primaryEthosPriceFromTierStrings(tierStrings, quantityBreakTiers));
    });
    const minEthosPrice = Math.min(...ethosPrices);

    const payload: EthosImportProductPayload = {
      supplierSlug,
      shopDomain: ctx.shopDomain,
      shopifyProductGid: sel.shopifyProductGid,
      title,
      productType,
      ethosPrice: minEthosPrice,
      variants: variantRows.map((v) => {
        const meta = variantMeta.get(v.shopifyVariantGid);
        const tierStrings = quantityTierStringsFromStorage(
          v.ethosQuantityPricing,
          v.ethosPrice?.toString(),
          quantityBreakTiers,
        );
        const filledTiers = parseFilledQuantityTierStrings(tierStrings, quantityBreakTiers);
        const ethosPrice = Number(primaryEthosPriceFromTierStrings(tierStrings, quantityBreakTiers));
        return {
          shopifyVariantGid: v.shopifyVariantGid,
          color: meta?.color ?? "Default",
          size: meta?.size ?? "One Size",
          supplierSku: meta?.sku ?? null,
          quantity: meta?.quantity ?? 0,
          ethosPrice,
          ...(sel.offerQuantityDiscounts && filledTiers.length > 0
            ? { quantityTierPricing: filledTiers }
            : {}),
        };
      }),
      attachments: sel.attachments
        .filter((a) => !a.storageKey.startsWith("local-preview://"))
        .map((a) => ({
          storageKey: a.storageKey,
          filename: a.filename,
          contentType: a.contentType,
          label: a.label,
          category: a.category,
        })),
    };

    const line = await prisma.submissionLine.create({
      data: {
        submissionId: submission.id,
        shopifyProductGid: sel.shopifyProductGid,
        shopifyVariantGids: variantRows.map((v) => v.shopifyVariantGid),
        ethosPrice: new Decimal(minEthosPrice),
        status: "processing",
      },
    });

    const result = await importProductToEthos(payload, {
      previewStub: ctx.mode === "preview",
    });

    if (!result.ok) {
      failed += 1;
      errors.push(`${title}: ${result.error}`);
      await prisma.submissionLine.update({
        where: { id: line.id },
        data: { status: "failed", errorMessage: result.error },
      });
      continue;
    }

    imported += 1;
    await prisma.submissionLine.update({
      where: { id: line.id },
      data: { status: "imported" },
    });

    const productMap = await prisma.shopifyProductMap.create({
      data: {
        shopDomain: ctx.shopDomain,
        shopifyProductGid: sel.shopifyProductGid,
        ethosSupplierSlug: supplierSlug,
        itemCode: result.itemCode,
      },
    });

    await prisma.shopifyVariantMap.createMany({
      data: payload.variants.map((v) => ({
        shopDomain: ctx.shopDomain,
        shopifyVariantGid: v.shopifyVariantGid,
        shopifyProductGid: sel.shopifyProductGid,
        shopifyProductMapId: productMap.id,
        ethosSupplierSlug: supplierSlug,
        itemCode: result.itemCode,
        color: v.color,
        size: v.size,
        shopifyBarcode: null,
      })),
      skipDuplicates: true,
    });
  }

  const finalStatus =
    failed > 0 && imported === 0 ? "failed" : failed > 0 ? "needs_attention" : imported > 0 ? "imported" : "submitted";

  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: finalStatus },
  });

  return {
    ok: imported > 0 && failed === 0,
    submissionId: submission.id,
    imported,
    failed,
    skipped,
    errors,
  };
}
