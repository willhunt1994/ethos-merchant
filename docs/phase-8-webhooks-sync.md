# Phase 8 — Webhooks + inventory/product sync

## Merchant app (`ethos-merchant`)

### Webhook subscriptions (`shopify.app.toml`)

| Topic | Route | Behavior |
|-------|--------|----------|
| `products/update` | `/webhooks/products/update` | Sync title/type to Ethos; push variant `inventory_quantity` for mapped variants |
| `products/delete` | `/webhooks/products/delete` | Mark Ethos custom product `discontinued` / inactive |
| `inventory_levels/update` | `/webhooks/inventory_levels/update` | Resolve inventory item → variant via Admin API; patch Ethos qty + `location_quantities` |

Deduping: Postgres `WebhookEvent` unique on `(shopDomain, topic, payloadHash)`.

Only products with a `ShopifyProductMap` row (post–Phase 6 import) are synced.

### Env

Same as Phase 6:

```env
ETHOS_INTEGRATION_API_URL=http://127.0.0.1:5010
ETHOS_INTEGRATION_API_KEY=<shared secret>
```

Inventory webhooks need a valid **offline session** (open the embedded app once after install).

After changing `shopify.app.toml`, restart `pnpm dev` so the CLI re-registers subscriptions.

## Ethos Employee API

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/integrations/shopify/v1/sync-product` | Update label, product type, status |
| `POST` | `/integrations/shopify/v1/sync-inventory` | Partial variant inventory update (no full variant replace) |

Auth: same Bearer key as `import-product`.

## Smoke test

1. Import a product (Phase 6).
2. In Shopify Admin, change product title or adjust inventory for a mapped variant.
3. Confirm webhook runs (merchant dev terminal) and Ethos product reflects the change.
4. Optional: delete product in Shopify → Ethos product status `discontinued`.
