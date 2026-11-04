# Shopify → Ethos field mapping (custom catalog)

**Date:** 2026-11-04  
**Shopify Admin GraphQL API version:** `2026-01` ([object reference](https://shopify.dev/docs/api/admin-graphql/latest))  
**Ethos destination:** Custom supplier catalog (`catalog_custom_*`) + integration metadata in **PostgreSQL** (merchant app)  
**Status:** Pre-implementation — requires your approval before integration code or MySQL DDL

---

## 1. Primary mapping table

| Shopify field | Shopify GraphQL source | Ethos MySQL table | Ethos MySQL column | Service / model | Action |
|---------------|-------------------------|-------------------|--------------------|-----------------|--------|
| Product title | `Product.title` | `catalog_custom_products` | `label`, optionally `ethos_name` | `createCustomProduct`, `updateCustomProduct` | **REUSE** |
| Description | `Product.descriptionHtml` | `catalog_custom_product_content` | `description_html` | `upsertCustomProductContent` | **REUSE** |
| Product ID (GID) | `Product.id` | — (Postgres) | `ShopifyProductMap.shopifyProductGid` | NEW integration store | **NEW** |
| Variant ID (GID) | `ProductVariant.id` | — (Postgres) | `ShopifyVariantMap.shopifyVariantGid` | NEW integration store | **NEW** |
| Variant title | `ProductVariant.title`, `ProductVariant.displayName` | `catalog_custom_variants` | `color`, `size` (derived) | `replaceCustomVariants` | **REUSE** + transform |
| SKU | `ProductVariant.inventoryItem.sku` or `InventoryItem.sku` | `catalog_custom_variants` | `supplier_sku` | `replaceCustomVariants` | **REUSE** |
| Barcode | `ProductVariant.barcodes` (connection) or legacy `barcode` (deprecated) | — or `catalog_custom_variants` (proposed) | TBD `barcode` | — | **EXTEND** or Postgres metadata |
| Weight | `ProductVariant.inventoryItem.measurement.weight` (`Weight.value`, `Weight.unit`) | `catalog_custom_variants` | `weight_oz` | `normalizeVariantCommerceInput` | **REUSE** (convert to oz) |
| Weight unit | `Weight.unit` on measurement | — | — | conversion at import | **REUSE** (normalize to oz) |
| HS code | `InventoryItem.harmonizedSystemCode` | `catalog_custom_variants` | `hs_code` | `normalizeVariantHsCode` (max 16) | **REUSE** |
| Country of origin | `InventoryItem.countryCodeOfOrigin` | — (proposed) | TBD | — | **EXTEND** or Postgres |
| Product media | `Product.media` / `Product.featuredMedia` | `catalog_custom_product_media` | `storage_key`, `source_storage_key` | `addCustomProductMedia`, S3 | **REUSE** |
| Inventory quantity | `InventoryLevel.quantities(names: ["available"])` | `catalog_custom_variants` | `quantity`, `location_quantities` | Live GraphQL/webhook sync job (not stale cache) | **REUSE** + live pull policy |
| Inventory location | `InventoryLevel.location.id` | `catalog_custom_variants` | `location_quantities` JSON keys | `normalizeLocationQuantitiesInput` | **REUSE** (key = Shopify location GID) |
| Shopify retail price | `ProductVariant.price` | — (display); optional `catalog_custom_variants` | `cost_price` | variant commerce | **REUSE** reference only |
| Ethos-specific price | Merchant input (not Shopify) | `catalog_custom_products` | `pricing_settings` → `ethosPrice` | `normalizeSsItemPricingSettings` | **REUSE** |
| Supplier ID | Ethos admin (not Shopify) | `catalog_custom_suppliers` | `id`, `slug` | `getCustomSupplierBySlug` | **REUSE** via approved shop map |
| Design attachments | Merchant upload | `catalog_product_cad` | `storage_key`, `label`, `content_type` | `addProductCad`, S3 `product-cad/` | **REUSE** / **EXTEND** MIME |
| Product type | `Product.productType` | `catalog_custom_products` | `product_type` | `updateCustomProduct` | **REUSE** |
| Vendor | `Product.vendor` | — | — | map to metadata or `label` context | **NEW** Postgres or optional column |
| Shopify status | `Product.status` | `catalog_custom_products` | `product_status`, `active` | `normalizeCustomProductStatus` | **REUSE** (map ACTIVE→available, etc.) |
| Collections (filter) | `Product.collections` / search `collection_id` | — | — | Postgres selection state only | **NEW** (not imported as Ethos collection) |
| Options | `Product.options`, `ProductVariant.selectedOptions` | — | — | transform → color/size | **NEW** logic in merchant app |

---

## 2. Per-field specification

Each field: GraphQL path, scope, destination, service, types, nullability, constraints, transforms, ownership, sync, null handling, DB change.

### 2.1 Product title

| # | Detail |
|---|--------|
| GraphQL | `Product.title` (String!, scope `read_products`) |
| MySQL | `catalog_custom_products.label` (VARCHAR 255 NULL), `ethos_name` (VARCHAR 255 NULL) |
| Service | `createCustomProduct`, `updateCustomProduct` |
| Type | string |
| Nullable | Yes |
| Uniqueness | `(supplier_id, item_code)` unique — not title |
| Transform | Trim; `label` = Shopify title on first import; `ethos_name` optional Ethos editorial name (employee-editable) |
| Ownership | Shopify source for initial import; Ethos may override `ethos_name` |
| Auto-sync | Title → update `label` only if Ethos has not locked field (policy: see §4) |
| Null/missing | N/A (required on Product) |
| DB change | None |

### 2.2 Description

| # | Detail |
|---|--------|
| GraphQL | `Product.descriptionHtml` (HTML!, `read_products`) |
| MySQL | `catalog_custom_product_content.description_html` (MEDIUMTEXT NULL) |
| Service | `upsertCustomProductContent` |
| Nullable | Yes |
| Sync | Shopify → Ethos when empty or when merchant-owned sync enabled |
| DB change | None |

### 2.3 Product ID (Shopify GID)

| # | Detail |
|---|--------|
| GraphQL | `Product.id` (ID!) |
| Postgres | `ShopifyProductMap`: `shopifyProductGid`, `shopDomain`, `supplierSlug`, `itemCode` |
| MySQL optional | `catalog_custom_products.product_code` (VARCHAR 64) — store numeric legacy ID or short ref only if needed for admin display |
| Uniqueness | Unique per shop: `(shopDomain, shopifyProductGid)` in Postgres |
| Service | NEW mapping repository |
| DB change | **NEW** Postgres table only (preferred) |

### 2.4 Variant ID (Shopify GID)

| # | Detail |
|---|--------|
| GraphQL | `ProductVariant.id` (ID!) |
| Postgres | `ShopifyVariantMap`: links GID → `(supplierSlug, itemCode, color, size)` |
| Uniqueness | Unique per shop: `(shopDomain, shopifyVariantGid)` |
| DB change | **NEW** Postgres |

### 2.5 Variant title / options

| # | Detail |
|---|--------|
| GraphQL | `ProductVariant.selectedOptions { name, value }`, `ProductVariant.title`, `Product.options { name, values }` |
| MySQL | `catalog_custom_variants.color` (VARCHAR 128 NOT NULL), `size` (VARCHAR 64 NOT NULL, default `OS`) |
| Service | `replaceCustomVariants`, `dedupeCustomVariantInputs`, `normalizeComboSizeLabel` |
| Transform | **Rule (proposed):** option named `Color`/`Colour` → `color`; `Size` → `size`; else first option → color, second → size; single default variant → `color=Default`, `size=OS` |
| Uniqueness | `UNIQUE (product_id, color, size)` case-insensitive dedupe in service |
| DB change | None (transform only) |

### 2.6 SKU

| # | Detail |
|---|--------|
| GraphQL | `ProductVariant.inventoryItem { sku }` or nested from variant query |
| MySQL | `catalog_custom_variants.supplier_sku` (VARCHAR 128 NOT NULL) |
| Service | `replaceCustomVariants`; `ensureEthosSkusForStyle` |
| Uniqueness | `catalog_ethos_skus`: `UNIQUE (supplier, supplier_sku)` — **conflict → Needs Attention**, no silent merge |
| Sync | Shopify → Ethos when SKU changes on mapped variant |
| Null | Generate via `defaultSupplierSku(itemCode, color, size)` if empty |
| DB change | None |

### 2.7 Barcode

| # | Detail |
|---|--------|
| GraphQL | `ProductVariant.barcodes { edges { node { barcode } } }` (`read_products`) |
| MySQL | No column today |
| Ethos SKUs | `catalog_ethos_skus.barcode_value` is **Ethos** barcode (`E-########`), not Shopify |
| Action | **EXTEND** `catalog_custom_variants.barcode` OR store in Postgres `ShopifyVariantMap.shopifyBarcode` |
| Sync | Optional import to MySQL column if approved |
| DB change | **Pending approval** (see gap analysis) |

### 2.8 Weight & unit

| # | Detail |
|---|--------|
| GraphQL | `InventoryItem.measurement.weight { value, unit }` |
| MySQL | `catalog_custom_variants.weight_oz` (DECIMAL 10,3 NULL) |
| Service | `normalizeVariantWeightOz` |
| Transform | Convert `KILOGRAMS`/`GRAMS`/`POUNDS`/`OUNCES` to ounces |
| Sync | Update when Shopify changes and Ethos field empty or sync policy allows |
| DB change | None |

### 2.9 HS code

| # | Detail |
|---|--------|
| GraphQL | `InventoryItem.harmonizedSystemCode` (String, 6–13 digits) |
| MySQL | `catalog_custom_variants.hs_code` (VARCHAR 16 NULL) |
| Service | `normalizeVariantHsCode` (truncate 16) |
| Sync | Shopify → Ethos when empty on Ethos side |
| DB change | None |

### 2.10 Country of origin

| # | Detail |
|---|--------|
| GraphQL | `InventoryItem.countryCodeOfOrigin` (CountryCode, ISO 3166-1 alpha-2) |
| MySQL | No custom-catalog column |
| Action | **EXTEND** product or variant table OR Postgres metadata on `ShopifyVariantMap` |
| DB change | **Pending approval** |

### 2.11 Product media

| # | Detail |
|---|--------|
| GraphQL | `Product.media(first:n) { nodes { ... on MediaImage { image { url } } } }`, `featuredMedia` |
| MySQL | `catalog_custom_product_media` (`storage_key`, `source_storage_key`, `sort_order`, `label`, `color_key`) |
| S3 | `custom-products/{supplierSlug}/{productId}/{uuid}.ext` |
| Service | presigned prepare + `addCustomProductMedia` |
| De-dupe | Set `source_storage_key` to stable Shopify media URL or GID |
| Sync | New media appended; do not delete Ethos-uploaded media without policy |
| DB change | None |

### 2.12 Inventory quantity & location

| # | Detail |
|---|--------|
| GraphQL | `InventoryItem.inventoryLevels { nodes { location { id name } quantities(names:["available"]) { quantity } } }` |
| Scope | `read_inventory`, `read_locations` |
| MySQL | `catalog_custom_variants.quantity` (INT), `location_quantities` (JSON) |
| Precondition | Do not write into Ethos **tracked** warehouse bins; sync live Shopify levels into variant fields or display live from Shopify in merchant UI |
| Transform | JSON key = Shopify `Location.id` GID string; values = available qty integers |
| Service | NEW sync job calling `replaceCustomVariants` partial update or dedicated inventory patch |
| Tracked suppliers | **Do not** write Shopify qty into Ethos warehouse bins |
| DB change | None |

### 2.13 Shopify retail price

| # | Detail |
|---|--------|
| GraphQL | `ProductVariant.price` (Money!) |
| MySQL | Optional `catalog_custom_variants.cost_price` as reference; product-level `cost_price` JSON aggregated in `syncProductCostFromVariants` |
| Rule | **Never** write to Shopify; display-only in merchant app |
| DB change | None |

### 2.14 Ethos-specific price

| # | Detail |
|---|--------|
| Source | Merchant submission UI (Postgres draft → integration payload) |
| MySQL | `catalog_custom_products.pricing_settings` JSON, field `ethosPrice` (number \| null) |
| Service | `updateCustomProduct` with `normalizeSsItemPricingSettings` |
| Ownership | Merchant → Ethos on submit; Ethos staff may edit in admin |
| Sync | Not overwritten by Shopify |
| DB change | None |

### 2.15 Supplier ID

| # | Detail |
|---|--------|
| Source | Ethos Employee admin creates `catalog_custom_suppliers` |
| Mapping | Postgres `ShopSupplierLink`: `customSupplierId`, `shopDomain`, `approvalStatus` |
| MySQL | `catalog_custom_products.supplier_id` FK |
| Rule | Merchant cannot choose supplier; admin approves link |
| DB change | **NEW** Postgres (+ optional Employee admin UI) |

### 2.16 Design attachments

| # | Detail |
|---|--------|
| Source | Merchant upload (PDF, AI, EPS, SVG, PNG, JPG, DOCX) |
| MySQL | `catalog_product_cad` (`supplier`, `item_code`, `storage_key`, `label`, `content_type`, `sort_order`) |
| S3 | `{PRODUCT_CAD_S3_PREFIX}/{supplier}/{itemCode}/{uuid}.ext` |
| Service | Extend `isAllowedProductCadUpload` beyond `.ai` only |
| Categories | Store in `label` or extend with `category` enum (**EXTEND**) |
| Instructions | Postgres submission `merchantInstructions` TEXT or `catalog_product_ethos_details` text fields |
| DB change | MIME/category **EXTEND** (Employee app) |

---

## 3. Example GraphQL fragments (2026-01)

Product list (browser pagination):

```graphql
query ProductsPage($first: Int!, $after: String, $query: String) {
  products(first: $first, after: $after, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      status
      productType
      vendor
      totalInventory
      featuredMedia { preview { image { url } } }
      variantsCount { count }
      priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
    }
  }
}
```

Variant detail for submission:

```graphql
query ProductForSubmission($id: ID!) {
  product(id: $id) {
    id
    title
    descriptionHtml
    productType
    vendor
    options { name values }
    media(first: 20) {
      nodes {
        ... on MediaImage { id image { url altText } }
      }
    }
    variants(first: 100) {
      nodes {
        id
        title
        displayName
        selectedOptions { name value }
        price
        inventoryItem {
          id
          sku
          tracked
          harmonizedSystemCode
          countryCodeOfOrigin
          measurement { weight { value unit } }
          inventoryLevels(first: 20) {
            nodes {
              location { id name }
              quantities(names: ["available"]) { name quantity }
            }
          }
        }
        barcodes(first: 5) { nodes { barcode } }
      }
    }
  }
}
```

---

## 4. Field ownership & sync policy

| Field | Source of truth | Sync direction | Overwrite rules |
|-------|-----------------|----------------|-----------------|
| Product title (`label`) | Shopify initially; Ethos may edit `ethos_name` | Shopify → Ethos if unmodified since import | Do not overwrite if employee changed `ethos_name` or locked |
| Description | Same | Shopify → Ethos if empty or merchant-sync enabled | Preserve employee HTML edits |
| SKU | Shopify for merchant catalog | Shopify → Ethos on mapped variants | Flag if `supplier_sku` matches different Shopify GID |
| Weight / HS code | Shopify for merchant goods | Shopify → Ethos when Ethos null | Do not clear Ethos-set values |
| Product media | Hybrid | Shopify → S3/Ethos media for new URLs | Keep merchant design uploads; de-dupe via `source_storage_key` |
| Inventory (merchant) | Shopify (live) | Shopify → Ethos at sync/display time | Never apply to Ethos `tracked` warehouse bin stock; prefer live API/webhook reads over stale cache |
| Supplier | Ethos Employee | Ethos → integration | Never merchant-editable |
| Ethos-specific price | Merchant submission | Merchant → Ethos | Shopify price changes do not affect `ethosPrice` |
| Design attachments | Merchant submission | Merchant → Ethos | Append/replace per approval rules; never delete on Shopify sync |
| Ethos SKU / barcode (`E-*`) | Ethos | Ethos only | Generated by `ensureEthosSkusForStyle` |
| `product_status` | Ethos + Shopify status hint | Import maps ARCHIVED/DRAFT → discontinued/sample | Employee override wins |

**Manual review triggers:** SKU collision on `catalog_ethos_skus`, missing required attachments, unapproved shop-supplier link, variant option mapping ambiguity.

---

## 5. Shopify access scopes (verified intent)

| Scope | Used for |
|-------|----------|
| `read_products` | Products, variants, media, `InventoryItem` nested under variant |
| `read_inventory` | `InventoryLevel`, quantities |
| `read_locations` | Location names/IDs for inventory display |

Optional later: `read_files` if using Files API outside product media.

**Not requested:** `write_products`, `write_inventory` (inventory sync is read-only from Shopify into Ethos).

---

## 6. S3 integration plan (summary)

| Asset type | Bucket / prefix | Metadata table |
|------------|-----------------|----------------|
| Shopify-sourced images | Same as custom media: `custom-products/...` | `catalog_custom_product_media` |
| Merchant design docs | `product-cad/{supplier}/{itemCode}/` | `catalog_product_cad` |
| Spec suggested prefix `ethos-shopify/merchants/...` | **Alternative** — align with existing `product-cad` and `custom-products` first (**REUSE**) before new prefix |

Upload path: Merchant app server fetches Shopify CDN URL → stream to S3 → register row via integration API calling existing Employee services.

---

## 7. Approval checkpoint

This document must be approved together with [repository-audit.md](./repository-audit.md) and [shopify-ethos-schema-gap-analysis.md](./shopify-ethos-schema-gap-analysis.md) before:

- Scaffolding the Shopify app (Phase 3)
- Any MySQL `ALTER TABLE`
- Production integration credentials
