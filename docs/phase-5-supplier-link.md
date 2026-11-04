# Phase 5 — Shop ↔ Ethos supplier link

Merchants do **not** choose a supplier in the app. Ethos links each `*.myshopify.com` store to a `catalog_custom_suppliers` row in Postgres as `ShopSupplierLink`.

## Merchant UI

- **Settings** — shows slug, approval status, whether submission is allowed.
- **Selected** — banner when not approved (configure/uploads still allowed).

Submission to Employee stays **Phase 6**; `canSubmit` is true only when `approvalStatus === approved`.

## Link a shop (operations)

### CLI (local / Railway DB via `DATABASE_URL`)

```bash
# Replace 123 and your-slug with values from Ethos Employee (catalog_custom_suppliers.id / .slug)
pnpm link-supplier -- --shop ethos-merchant.myshopify.com --slug your-slug --id 123 --approve
```

Find id/slug in Employee MySQL:

```sql
SELECT id, slug, name, active FROM catalog_custom_suppliers ORDER BY id DESC LIMIT 20;
```

(`name` is the display name; there is no `label` column on this table.)

Omit `--approve` for `pending`, or use `--reject`.

### HTTP API (Ethos Employee → merchant app)

`POST /api/integrations/shop-supplier-link`

Header: `Authorization: Bearer <ETHOS_INTEGRATION_API_KEY>` (same value on both apps)

```json
{
  "shopDomain": "ethos-merchant.myshopify.com",
  "ethosSupplierId": 123,
  "ethosSupplierSlug": "your-slug",
  "approvalStatus": "approved",
  "approvedByUserRef": "employee:42"
}
```

## Dev auto-link

In `.env` (non-production), set `ETHOS_DEV_SHOP_DOMAIN`, `ETHOS_DEV_SUPPLIER_ID`, `ETHOS_DEV_SUPPLIER_SLUG`, and optionally `ETHOS_DEV_AUTO_APPROVE_SUPPLIER=1`. Applied on each OAuth `afterAuth` when the shop domain matches.
