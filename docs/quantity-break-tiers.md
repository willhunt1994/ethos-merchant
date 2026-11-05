# Shop quantity break tiers

Merchants define **shop-wide** quantity ranges under **Settings → Quantity break tiers**. Configure pages and submission use these ranges for volume pricing columns and `quantityTierPricing` on Ethos import.

## Storage

- `Shop.quantityBreakTiers` — JSON array of `{ minQty, maxQty }` (2–10 tiers, contiguous, starting at 1).
- `VariantSelection.ethosQuantityPricing` — JSON array of `{ minQty, maxQty, price }` per variant.

When shop tiers change, existing variant prices are **remapped by matching min/max**, not by column index.

## Ethos Employee / import verification (staging)

1. In Settings, set custom tiers (e.g. `1–25`, `26–100`, `101–500`).
2. Configure a product with quantity discounts **Yes**, fill prices per tier, submit.
3. Confirm `POST /integrations/shopify/v1/import-product` payload includes `quantityTierPricing` with the custom `minQty` / `maxQty` values.
4. In Employee admin, confirm catalog pricing reflects those breaks (or document any Employee-side constraints).

Local check: `node scripts/verify-quantity-tiers.mjs`
