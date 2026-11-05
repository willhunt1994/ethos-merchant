import type { Prisma } from "@prisma/client";
import {
  DEFAULT_QUANTITY_BREAK_TIERS,
  quantityTierKey,
  type QuantityTierDefinition,
} from "./quantity-tier-definitions";

export type { QuantityTierDefinition } from "./quantity-tier-definitions";
export {
  DEFAULT_QUANTITY_BREAK_TIERS,
  MERCHANT_QUANTITY_PRICE_TIERS,
  formatQuantityTierLabel,
} from "./quantity-tier-definitions";

export type StoredQuantityTierPrice = {
  minQty: number;
  maxQty: number;
  price: number;
};

export type QuantityTierPriceStrings = string[];

export function emptyQuantityTierPriceStrings(
  tiers: QuantityTierDefinition[] = DEFAULT_QUANTITY_BREAK_TIERS,
): QuantityTierPriceStrings {
  return Array.from({ length: tiers.length }, () => "");
}

function parsePriceString(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value.toFixed(2);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const n = Number.parseFloat(trimmed);
    if (Number.isFinite(n) && n > 0) return n.toFixed(2);
  }
  return "";
}

function priceFromStorageRow(row: unknown): string {
  if (row && typeof row === "object") {
    return parsePriceString((row as { price?: unknown }).price);
  }
  return parsePriceString(row);
}

function minMaxFromStorageRow(row: unknown): { minQty: number; maxQty: number } | null {
  if (!row || typeof row !== "object") return null;
  const minQty = (row as { minQty?: unknown }).minQty;
  const maxQty = (row as { maxQty?: unknown }).maxQty;
  if (typeof minQty !== "number" || typeof maxQty !== "number") return null;
  if (!Number.isInteger(minQty) || !Number.isInteger(maxQty)) return null;
  return { minQty, maxQty };
}

/** Load tier strings from DB JSON and/or legacy single `ethosPrice`, matched by min/max qty. */
export function quantityTierStringsFromStorage(
  raw: unknown,
  ethosPrice: string | null | undefined,
  tierDefinitions: QuantityTierDefinition[] = DEFAULT_QUANTITY_BREAK_TIERS,
): QuantityTierPriceStrings {
  const tiers = emptyQuantityTierPriceStrings(tierDefinitions);
  const priceByKey = new Map<string, string>();

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      const price = priceFromStorageRow(row);
      if (!price) continue;
      const bounds = minMaxFromStorageRow(row);
      if (bounds) {
        priceByKey.set(quantityTierKey(bounds.minQty, bounds.maxQty), price);
      } else if (i < tierDefinitions.length) {
        const def = tierDefinitions[i]!;
        priceByKey.set(quantityTierKey(def.minQty, def.maxQty), price);
      }
    }
  }

  for (let i = 0; i < tierDefinitions.length; i++) {
    const def = tierDefinitions[i]!;
    const key = quantityTierKey(def.minQty, def.maxQty);
    const price = priceByKey.get(key);
    if (price) tiers[i] = price;
  }

  if (!tiers[0] && ethosPrice) {
    const base = parsePriceString(ethosPrice);
    if (base) tiers[0] = base;
  }
  return tiers;
}

/** All tiers filled (strict — rarely needed in UI validation). */
export function parseQuantityTierStrings(
  values: QuantityTierPriceStrings,
  tierDefinitions: QuantityTierDefinition[] = DEFAULT_QUANTITY_BREAK_TIERS,
): StoredQuantityTierPrice[] | null {
  const out: StoredQuantityTierPrice[] = [];
  for (let i = 0; i < tierDefinitions.length; i++) {
    const priceStr = String(values[i] ?? "").trim();
    if (!priceStr) return null;
    const price = Number.parseFloat(priceStr);
    if (!Number.isFinite(price) || price <= 0) return null;
    const tier = tierDefinitions[i]!;
    out.push({ minQty: tier.minQty, maxQty: tier.maxQty, price: Number(price.toFixed(2)) });
  }
  return out;
}

/** Only tiers the merchant entered (higher qty breaks are optional). */
export function parseFilledQuantityTierStrings(
  values: QuantityTierPriceStrings,
  tierDefinitions: QuantityTierDefinition[] = DEFAULT_QUANTITY_BREAK_TIERS,
): StoredQuantityTierPrice[] {
  const out: StoredQuantityTierPrice[] = [];
  for (let i = 0; i < tierDefinitions.length; i++) {
    const priceStr = parsePriceString(values[i]);
    if (!priceStr) continue;
    const price = Number.parseFloat(priceStr);
    const tier = tierDefinitions[i]!;
    out.push({ minQty: tier.minQty, maxQty: tier.maxQty, price: Number(price.toFixed(2)) });
  }
  return out;
}

/** Base tier (lowest min qty) price is required; other tiers are optional. */
export function variantPricingCompleteForProduct(
  values: QuantityTierPriceStrings,
  _offerQuantityDiscounts: boolean,
  tierDefinitions: QuantityTierDefinition[] = DEFAULT_QUANTITY_BREAK_TIERS,
): boolean {
  return Boolean(primaryEthosPriceFromTierStrings(values, tierDefinitions));
}

/** Persist all tiers (including empty) so the UI can reload partial progress. */
export function quantityTierStringsToJson(
  values: QuantityTierPriceStrings,
  tierDefinitions: QuantityTierDefinition[] = DEFAULT_QUANTITY_BREAK_TIERS,
): Prisma.InputJsonValue {
  return tierDefinitions.map((tier, i) => {
    const priceStr = parsePriceString(values[i]);
    return {
      minQty: tier.minQty,
      maxQty: tier.maxQty,
      price: priceStr || null,
    };
  });
}

/** Remap tier price strings when switching standard vs custom column sets. */
export function remapQuantityTierPriceStrings(
  values: QuantityTierPriceStrings,
  fromTiers: QuantityTierDefinition[],
  toTiers: QuantityTierDefinition[],
): QuantityTierPriceStrings {
  const json = quantityTierStringsToJson(values, fromTiers);
  return quantityTierStringsFromStorage(json, null, toTiers);
}

export function primaryEthosPriceFromTierStrings(
  values: QuantityTierPriceStrings,
  tierDefinitions: QuantityTierDefinition[] = DEFAULT_QUANTITY_BREAK_TIERS,
): string {
  void tierDefinitions;
  const first = String(values[0] ?? "").trim();
  if (first) {
    const n = Number.parseFloat(first);
    if (Number.isFinite(n) && n > 0) return n.toFixed(2);
  }
  return "";
}
