import prisma from "../db.server";
import {
  DEFAULT_QUANTITY_BREAK_TIERS,
  parseAndValidateQuantityBreakTiers,
  type QuantityTierDefinition,
} from "./quantity-tier-definitions";

export async function getShopQuantityBreakTiers(
  shopDomain: string,
): Promise<QuantityTierDefinition[]> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { quantityBreakTiers: true },
  });
  if (!shop?.quantityBreakTiers) {
    return [...DEFAULT_QUANTITY_BREAK_TIERS];
  }
  const parsed = parseAndValidateQuantityBreakTiers(shop.quantityBreakTiers);
  if (!parsed.ok) {
    return [...DEFAULT_QUANTITY_BREAK_TIERS];
  }
  return parsed.tiers;
}

export function quantityBreakTiersFromShopRecord(
  quantityBreakTiers: unknown,
): QuantityTierDefinition[] {
  if (quantityBreakTiers == null) {
    return [...DEFAULT_QUANTITY_BREAK_TIERS];
  }
  const parsed = parseAndValidateQuantityBreakTiers(quantityBreakTiers);
  if (!parsed.ok) {
    return [...DEFAULT_QUANTITY_BREAK_TIERS];
  }
  return parsed.tiers;
}
