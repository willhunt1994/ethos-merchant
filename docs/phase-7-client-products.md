# Phase 7 — Employee incoming Shopify imports (Client Products)

## Ethos Employee

### Admin UI

- **Client Products** — `/products/client-products`
- Lists custom catalog rows created via merchant `POST /integrations/shopify/v1/import-product`
- **Review in Ethos** opens the standard product editor (`/products/{itemCode}?supplier=…`)
- Optional **Shopify** link when shop domain + numeric Shopify product id are known

### API

- `GET /admin/shopify-merchant/imports` (admin auth, `nav.products`)
  - Query: `shopDomain`, `supplierSlug`, `limit` (max 500)

### Import metadata

Each import stores `pricing_settings.shopifyMerchant`:

```json
{
  "shopDomain": "ethos-merchant.myshopify.com",
  "shopifyProductGid": "gid://shopify/Product/123",
  "importedAt": "2026-11-04T…"
}
```

Products with numeric `product_code` (Shopify product id) are included even if metadata is missing (legacy imports).

## Merchant app

No changes required for Phase 7; Phase 6 submit flow continues to call `import-product`.

## Smoke test

1. Submit a product from the merchant app (Phase 6).
2. Open Employee admin → **Products → Client Products**.
3. Confirm the row appears with supplier, variant count, and **Review in Ethos** works.
