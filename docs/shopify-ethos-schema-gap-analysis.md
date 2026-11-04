# Schema gap analysis — Shopify merchant integration

**Date:** 2026-11-04  
**Principle:** Reuse `catalog_custom_*` for Ethos catalog rows; use **PostgreSQL** (merchant app) for Shopify operational state; **no** duplicate full product catalog in Postgres.

**MySQL structural changes below require explicit approval before migration.**

---

## 1. PostgreSQL (ethos-merchant / Railway)

All **NEW**. Justification: Shopify sessions, OAuth, merchant UX state, and external IDs must not live in Employee MySQL per project rules; Postgres is already provisioned and empty.

| Proposed table / model | Purpose | Why existing structures are insufficient |
|------------------------|---------|----------------------------------------|
| `Session` | Shopify OAuth session storage | Template requirement; no equivalent in merchant repo |
| `Shop` | Installed shop domain, access token, scopes | Template + multi-tenant isolation |
| `ShopSupplierLink` | Maps `shopDomain` → `catalog_custom_suppliers.id` (by slug/id), `approvalStatus`, `approvedBy`, timestamps | No table in Employee or merchant repo; merchants must not pick supplier |
| `MerchantUiPreference` | Grid/list view, filters | UX only; not catalog data |
| `ProductSelection` | Draft selected Shopify product GIDs per shop | Pre-submission merchant workspace |
| `VariantSelection` | Selected variant GIDs + draft `ethosPrice` overrides | Same |
| `Submission` | Durable submit batch (`status`, idempotency key, `submittedAt`) | Employee has no import queue |
| `SubmissionLine` | Per product/variant line, status, error message | Same |
| `ShopifyProductMap` | `shopifyProductGid`, `supplierSlug`, `itemCode`, `shopDomain` | MySQL has no Shopify GID column; `product_code` is too small/ambiguous for GID |
| `ShopifyVariantMap` | `shopifyVariantGid`, map to color/size, optional barcode cache | Same |
| `WebhookEvent` | Topic, payload hash, processed_at, retry count | Durable webhook processing |
| `SyncJob` / `SyncCursor` | Reconciliation timestamps per shop/resource | Operational |
| `AttachmentUpload` (optional) | Staging upload metadata before Employee CAD row | If uploads complete before MySQL product exists |

**Protection of existing data:** Postgres is isolated from Employee MySQL; no cross-DB FKs. Integration API writes MySQL only through Employee services with validation.

**Migrations:** Prisma migrations in ethos-merchant only; safe to apply on empty Railway DB.

**Service extension:** N/A on Employee for these tables.

---

## 2. MySQL (ethosemployee) — proposed extensions (approval required)

### 2.1 `catalog_custom_variants.barcode` (optional)

| Item | Detail |
|------|--------|
| Why | Store Shopify variant barcode separately from Ethos `catalog_ethos_skus.barcode_value` (`E-*`) |
| Why not existing | No variant-level barcode column |
| Repository | ethosemployee |
| Alternative | Keep barcode only in Postgres `ShopifyVariantMap` — sufficient for sync/display but not visible in all admin SQL/reporting |
| Migration | `ALTER TABLE catalog_custom_variants ADD COLUMN barcode VARCHAR(128) NULL AFTER supplier_sku` |
| Protection | Nullable; import only fills when Shopify provides barcode |

### 2.2 Country of origin (optional)

| Option | Detail |
|--------|--------|
| A | `catalog_custom_variants.country_of_origin CHAR(2) NULL` |
| B | Postgres only on variant map |
| Recommendation | Start with **Postgres** (no MySQL DDL); add MySQL column if employees need it in bulk-edit spreadsheets |

### 2.3 CAD attachment category (optional)

| Item | Detail |
|------|--------|
| Why | Spec categories: Brand Guidelines, Product Design, etc. |
| Existing | `catalog_product_cad.label` free text |
| Extension | `category VARCHAR(32) NULL` or enum — **EXTEND** |
| Alternative | Encode category in `label` prefix `[Brand Guidelines]` — no DDL |

### 2.4 Submission mirror table (optional — not recommended initially)

| Item | Detail |
|------|--------|
| Proposed | `shopify_product_submissions` in MySQL |
| Why not first choice | Submissions are operational; Postgres + integration API list endpoint can feed admin UI |
| If added later | Read-only mirror for reporting; populated by integration service |

---

## 3. MySQL — explicitly NOT proposed

| Idea | Reason |
|------|--------|
| Duplicate Shopify catalog tables in MySQL | Violates reuse principle |
| New supplier system | `catalog_custom_suppliers` exists |
| Migrate Employee products to Postgres | Out of scope |
| Store Shopify tokens in MySQL | Belongs in merchant Postgres `Shop` |
| Write Shopify inventory into warehouse bin tables for `tracked` suppliers | Would overwrite Ethos physical stock |

---

## 4. Application components — NEW vs REUSE

| Component | Repo | DB | Action |
|-----------|------|-----|--------|
| Integration router e.g. `/integrations/shopify/v1/submissions` | ethosemployee | — | **NEW** — calls `createCustomProduct`, `replaceCustomVariants`, media/CAD helpers |
| Integration auth middleware | ethosemployee | — | **NEW** — API key / HMAC |
| Incoming products admin page | ethosemployee | — | **EXTEND** replace `client-products` placeholder |
| Shopify embedded UI | ethos-merchant | Postgres | **NEW** |
| Webhook workers | ethos-merchant | Postgres | **NEW** |
| Custom catalog services | ethosemployee | MySQL | **REUSE** unchanged signatures |

---

## 5. Inventory model gap (business + technical)

| Gap | Resolution |
|-----|------------|
| Custom suppliers default `inventory_mode = tracked` | **Policy:** Shopify-linked merchants should use **`on_demand`** so `location_quantities` holds Shopify location qty |
| `replaceCustomVariants` zeroes quantity for on_demand on full replace | Integration should use **partial inventory updates** or dedicated endpoint (**EXTEND** Employee API) to avoid wiping qty on unrelated variant edits |
| Ethos warehouse bins | Unchanged; used only for `tracked` Ethos fulfillment stock |

**Proposed Employee API extension (Phase 8):** `PATCH .../variants/inventory` updating only `quantity` / `location_quantities` — **NEW** route wrapping repository logic.

---

## 6. Idempotency & integrity

| Mechanism | Location |
|-----------|----------|
| Unique `(shopDomain, shopifyProductGid)` | Postgres |
| Unique `(shopDomain, shopifyVariantGid)` | Postgres |
| Unique `(supplier_id, item_code)` | MySQL existing |
| Unique `(supplier, supplier_sku)` on `catalog_ethos_skus` | MySQL existing — conflict detection |
| Submission `idempotencyKey` | Postgres `Submission` |
| Webhook dedupe | Postgres `WebhookEvent` payload hash |

**Transactions:** Single-DB transactions in Employee on import; cross-system saga: Postgres submission state machine + retry + reconciliation job.

---

## 7. Environment & deployment gaps

| Gap | Mitigation |
|-----|------------|
| Railway service **ethos-merchant-shopify** vs repo **ethos-merchant** | Repoint GitHub + rename in Phase 3 deploy doc |
| Local Postgres TCP timeout | Document `railway connect Postgres --ssh` in README |
| No `SHOPIFY_INTEGRATION_API_KEY` | Add to Employee `.env.example` when integration ships |
| Partner app credentials | **BLOCKED** — user provides or reuses prior app |

---

## 8. Risk summary

| Risk | Mitigation |
|------|------------|
| Option → color/size mapping wrong | Configurable mapping rules + manual review status |
| Full variant replace clears inventory | Partial inventory API or careful merge in integration layer |
| SKU collision | `Needs Attention` status; no auto-merge |
| CAD upload MIME too strict | Extend `product-cad-routes.ts` validation |

---

## 9. Approval record (2026-11-04)

| Decision | Outcome |
|----------|---------|
| Postgres integration schema (§1) | **Approved** — implemented in Phase 3 (`prisma/schema.prisma`) |
| MySQL optional columns (§2) | **Approved as documented:** barcode + country on Postgres `ShopifyVariantMap` first; CAD category via `label` or future `category` column; no MySQL DDL in Phase 3 |
| Inventory policy | **Rejected** mandatory `on_demand`-only model. **Approved:** pull **live** Shopify stock via API/webhooks when displaying or syncing; do not treat stale Ethos warehouse bin counts as merchant inventory; do not require all linked suppliers to be `inventory_mode = on_demand` |
| Phase 3 scaffold + UI shell | **Approved** |

## 10. Inventory policy (approved detail)

- **Source of truth for merchant sellable quantity:** Shopify (live reads + webhooks + reconciliation).
- **Ethos `tracked` warehouse bins:** unchanged; never backfilled from Shopify snapshots.
- **Ethos MySQL variant `quantity` / `location_quantities`:** updated only through integration jobs that fetch current Shopify levels at sync time (not a substitute for live reads in the merchant UI).
- **Employee admin UI:** show `lastInventorySyncAt` and avoid presenting cached qty as live when stale.
