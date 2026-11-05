/**
 * Smoke checks for shop quantity tier validation and price remapping.
 * Run: node scripts/verify-quantity-tiers.mjs
 */
import assert from "node:assert/strict";

// Inline minimal copies of logic paths (ESM cannot import TS without build).
// After `pnpm build`, prefer importing from compiled output if added to CI.

const DEFAULT = [
  { minQty: 1, maxQty: 9 },
  { minQty: 10, maxQty: 24 },
];

function quantityTierKey(minQty, maxQty) {
  return `${minQty}:${maxQty}`;
}

function rematchPrices(raw, tierDefinitions) {
  const tiers = tierDefinitions.map(() => "");
  const priceByKey = new Map();
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i];
      if (!row || typeof row !== "object") continue;
      const price = row.price != null ? String(row.price) : "";
      if (!price) continue;
      if (typeof row.minQty === "number" && typeof row.maxQty === "number") {
        priceByKey.set(quantityTierKey(row.minQty, row.maxQty), price);
      } else if (i < tierDefinitions.length) {
        const def = tierDefinitions[i];
        priceByKey.set(quantityTierKey(def.minQty, def.maxQty), price);
      }
    }
  }
  for (let i = 0; i < tierDefinitions.length; i++) {
    const def = tierDefinitions[i];
    const p = priceByKey.get(quantityTierKey(def.minQty, def.maxQty));
    if (p) tiers[i] = p;
  }
  return tiers;
}

const stored = [
  { minQty: 1, maxQty: 9, price: "9.00" },
  { minQty: 10, maxQty: 24, price: "8.00" },
];

const newShopTiers = [
  { minQty: 1, maxQty: 25 },
  { minQty: 26, maxQty: 100 },
];

const remapped = rematchPrices(stored, newShopTiers);
assert.equal(remapped[0], "");
assert.equal(remapped[1], "");

const legacyIndex = rematchPrices(
  [{ price: "9.00" }, { price: "8.00" }],
  [{ minQty: 1, maxQty: 9 }, { minQty: 10, maxQty: 24 }],
);
assert.equal(legacyIndex[0], "9.00");
assert.equal(legacyIndex[1], "8.00");

const customTiers = [
  { minQty: 1, maxQty: 25, price: "12.00" },
  { minQty: 26, maxQty: 100, price: "10.00" },
];
const loaded = rematchPrices(customTiers, newShopTiers);
assert.equal(loaded[0], "12.00");
assert.equal(loaded[1], "10.00");

console.log("verify-quantity-tiers: ok");
