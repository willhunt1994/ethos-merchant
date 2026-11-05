# Phase 9 — E2E on `ethos-merchant` dev store

**Dev store:** `ethos-merchant.myshopify.com`

This phase confirms Phases 3–8 work together on the real Shopify dev store—not only local mocks.

## Automated smoke (infra + data)

With Postgres tunnel + Employee API running:

```bash
pnpm e2e:smoke
```

Checks:

- `DATABASE_URL` / Prisma
- `ETHOS_INTEGRATION_*` and Employee `/health`
- Integration auth (`sync-product` route)
- Shop row, **approved** supplier link, at least one `ShopifyProductMap` (Phase 6)

Does **not** replace manual Admin UI verification below.

## Manual E2E checklist

Run in order once per release or after major changes.

### A. Environment

- [ ] `pnpm db:tunnel` (if using Railway SSH Postgres)
- [ ] `pnpm dev` (merchant) — **Preview URL** / tunnel not `example.com`
- [ ] Employee API `:5010` (local) or production URL in `.env`
- [ ] Optional: Employee admin `:3007` for Client Products review

### B. Supplier link (Phase 5)

- [ ] Settings shows supplier slug and **Approved**
- [ ] If not: `pnpm link-supplier -- --shop ethos-merchant.myshopify.com --slug <slug> --id <mysqlId> --approve`

### C. Catalog → submit (Phases 3–6)

- [ ] **Products** — add items to selection
- [ ] **Selected → Configure** — Ethos price on every selected variant; optional uploads
- [ ] **Submit to Ethos** succeeds
- [ ] **Submissions** — lines `imported`; duplicate submit skipped via map

### D. Employee review (Phase 7)

- [ ] Admin → **Products → Client Products** — new row
- [ ] **Review in Ethos** opens product editor with variants/pricing

### E. Webhooks / sync (Phase 8)

- [ ] Open embedded app once (offline session for inventory webhooks)
- [ ] Change product **title** in Shopify Admin → Ethos label updates
- [ ] Adjust **inventory** on a mapped variant → Ethos quantity updates
- [ ] Optional: delete product in Shopify → Ethos **discontinued**

### F. Regression

- [ ] Landing page `/` loads (marketing site)
- [ ] App uninstall webhook clears session (only when testing uninstall)

## Sign-off

| Date | Tester | Smoke script | Manual A–E | Notes |
|------|--------|--------------|------------|-------|
| | | | | |

After sign-off, proceed to **public URL deploy** and **embedded app UX** polish.
