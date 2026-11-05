import prisma from "../db.server";
import { syncInventoryToEthos, syncProductToEthos } from "./ethos-integration.server";
import { shopifyGid, productGidFromWebhookPayload, variantGidFromWebhookVariant } from "./shopify/gid.server";
import { loadOfflineAdminForShop } from "./shopify/offline-admin.server";
import { resolveVariantGidForInventoryItem } from "./shopify/inventory-item.server";

type ProductWebhookPayload = Record<string, unknown> & {
  title?: string;
  product_type?: string;
  variants?: Array<Record<string, unknown>>;
};

type InventoryLevelPayload = Record<string, unknown> & {
  inventory_item_id?: number | string;
  location_id?: number | string;
  available?: number | null;
};

async function requireProductMap(shopDomain: string, shopifyProductGid: string) {
  return prisma.shopifyProductMap.findUnique({
    where: {
      shopDomain_shopifyProductGid: { shopDomain, shopifyProductGid },
    },
  });
}

export async function handleProductsUpdateWebhook(shopDomain: string, payload: ProductWebhookPayload) {
  const productGid = productGidFromWebhookPayload(payload);
  if (!productGid) return;

  const productMap = await requireProductMap(shopDomain, productGid);
  if (!productMap) return;

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const productType =
    typeof payload.product_type === "string" ? payload.product_type.trim() || null : null;

  if (title || productType) {
    const result = await syncProductToEthos({
      supplierSlug: productMap.ethosSupplierSlug,
      itemCode: productMap.itemCode,
      ...(title ? { label: title } : {}),
      ...(productType !== null ? { productType } : {}),
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
  }

  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  const inventoryPatches: Array<{
    color: string;
    size: string;
    quantity: number;
  }> = [];

  for (const variant of variants) {
    const variantGid = variantGidFromWebhookVariant(variant);
    if (!variantGid) continue;

    const mapRow = await prisma.shopifyVariantMap.findUnique({
      where: { shopifyVariantGid: variantGid },
    });
    if (!mapRow || mapRow.shopDomain !== shopDomain) continue;

    const qtyRaw = variant.inventory_quantity;
    if (typeof qtyRaw !== "number" || !Number.isFinite(qtyRaw)) continue;

    inventoryPatches.push({
      color: mapRow.color,
      size: mapRow.size,
      quantity: Math.max(0, Math.floor(qtyRaw)),
    });
  }

  if (inventoryPatches.length === 0) return;

  const invResult = await syncInventoryToEthos(
    productMap.ethosSupplierSlug,
    productMap.itemCode,
    inventoryPatches,
  );
  if (!invResult.ok) {
    throw new Error(invResult.error);
  }

  await prisma.shopifyVariantMap.updateMany({
    where: {
      shopDomain,
      shopifyProductGid: productGid,
      shopifyVariantGid: {
        in: variants
          .map((v) => variantGidFromWebhookVariant(v))
          .filter((gid): gid is string => Boolean(gid)),
      },
    },
    data: { lastInventorySyncAt: new Date() },
  });
}

export async function handleProductsDeleteWebhook(shopDomain: string, payload: Record<string, unknown>) {
  const productGid = productGidFromWebhookPayload(payload);
  if (!productGid) return;

  const productMap = await requireProductMap(shopDomain, productGid);
  if (!productMap) return;

  const result = await syncProductToEthos({
    supplierSlug: productMap.ethosSupplierSlug,
    itemCode: productMap.itemCode,
    productStatus: "discontinued",
    active: false,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
}

export async function handleInventoryLevelsUpdateWebhook(
  shopDomain: string,
  payload: InventoryLevelPayload,
) {
  const inventoryItemId = payload.inventory_item_id;
  const locationId = payload.location_id;
  const available = payload.available;

  if (inventoryItemId == null || locationId == null || typeof available !== "number") {
    return;
  }

  const admin = await loadOfflineAdminForShop(shopDomain);
  if (!admin) {
    throw new Error("No offline Shopify session — reinstall the app or open it once in Admin");
  }

  const resolved = await resolveVariantGidForInventoryItem(admin, inventoryItemId);
  if (!resolved) return;

  const mapRow = await prisma.shopifyVariantMap.findUnique({
    where: { shopifyVariantGid: resolved.shopifyVariantGid },
  });
  if (!mapRow || mapRow.shopDomain !== shopDomain) return;

  const locationGid = shopifyGid("Location", locationId);
  const result = await syncInventoryToEthos(mapRow.ethosSupplierSlug, mapRow.itemCode, [
    {
      color: mapRow.color,
      size: mapRow.size,
      quantity: Math.max(0, Math.floor(available)),
      locationQuantities: { [locationGid]: Math.max(0, Math.floor(available)) },
      mergeLocationQuantities: true,
    },
  ]);
  if (!result.ok) {
    throw new Error(result.error);
  }

  await prisma.shopifyVariantMap.update({
    where: { shopifyVariantGid: resolved.shopifyVariantGid },
    data: { lastInventorySyncAt: new Date() },
  });
}
