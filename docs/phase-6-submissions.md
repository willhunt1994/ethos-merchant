# Phase 6 — Pricing & submit to Ethos Employee

## Merchant app

1. **Configure** (`/app/selected/configure`) — per-variant Ethos price (USD), design uploads (unchanged).
2. **Selected** (`/app/selected`) — **Submit to Ethos** when supplier is approved and every selected variant has pricing.
3. **Submissions** (`/app/submissions`) — batch status and per-line errors.

### Env

```env
ETHOS_INTEGRATION_API_URL=https://your-employee-api.up.railway.app
ETHOS_INTEGRATION_API_KEY=<same secret as Employee>
```

`LOCAL_PREVIEW=1` stubs import (no HTTP call).

## Ethos Employee API

- `POST /integrations/shopify/v1/import-product`
- Auth: `Authorization: Bearer <SHOPIFY_MERCHANT_INTEGRATION_API_KEY>` (or `X-Ethos-Integration-Key`)

Creates a custom catalog product under the linked supplier, sets `pricing_settings.ethosPrice`, replaces variants, and registers CAD rows pointing at existing S3 keys.

### Env (Employee `apps/api`)

```env
SHOPIFY_MERCHANT_INTEGRATION_API_KEY=<same as merchant ETHOS_INTEGRATION_API_KEY>
```

## Smoke test

1. Configure pricing + optional uploads on a selected product.
2. Submit from Selected products.
3. Confirm item appears under supplier **ethos-merchant** in Employee admin.
4. Submissions page shows `imported` lines and `ShopifyProductMap` prevents duplicate import.

**Verified:** 2026-11-04 on dev store `ethos-merchant.myshopify.com` (local `pnpm dev` + Postgres tunnel + Employee API on `:5010`).
