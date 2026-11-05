# ethos-merchant

Shopify embedded app for merchants to submit catalog products to **Ethos Employee** (custom supplier catalog).

## Stack

- [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router) (TypeScript)
- PostgreSQL on Railway (`wonderful-adventure`)
- Prisma ORM · Zod

## Documentation

- [Repository audit](./docs/repository-audit.md)
- [Field mapping](./docs/shopify-ethos-field-mapping.md)
- [Schema gap analysis & approvals](./docs/shopify-ethos-schema-gap-analysis.md)

## GitHub

- Remote: `git@github.com:willhunt1994/ethos-merchant.git`
- Branch: `main`

## Environment

Copy [`.env.example`](./.env.example) to `.env`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Railway Postgres |
| `SHOPIFY_*`, `SCOPES` | Partner app (read-only catalog scopes) |
| `LOCAL_PREVIEW=1` | Dev-only mock UI (no Shopify OAuth) |
| `ETHOS_INTEGRATION_*` | Employee API (later phases) |

### Database access

If TCP to `*.proxy.rlwy.net` fails:

```bash
railway connect Postgres --ssh --tunnel-only -P 15435
```

Keep that terminal open. Point `DATABASE_URL` at `127.0.0.1:15435` (match the port you chose).

If the app shows **“Prisma session table does not exist”** but migrations are applied, the DB is usually **unreachable** (stale SSH tunnel). Kill the old `ssh` on that port and start a fresh tunnel, then **restart `pnpm dev`**.

Use a local URL in `.env`, then:

```bash
pnpm exec prisma migrate deploy
```

Migration SQL: `prisma/migrations/20261104103000_integration_schema/`.

## Development

```bash
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate deploy   # after DATABASE_URL works

# Embedded app (ethos-merchant dev store)
pnpm dev

# UI-only with mock products (no Shopify session)
LOCAL_PREVIEW=1 pnpm dev
```

### Admin shows “Example Domain” in the app iframe

That means Shopify is loading `application_url` as **`https://example.com`** instead of your dev tunnel. Fix:

1. Ensure **`shopify.web.toml`** exists in the project root (CLI uses it to run your React Router app and apply the tunnel URL). Without it, **`Using URL:`** stays on `example.com` even when Cloudflare starts.
2. Stop dev, then start again: `pnpm dev` (do **not** pass `--no-update`).
3. If the CLI asks to override app URLs on the dev store, choose **Yes, automatically update**.
4. In the terminal, confirm **`Using URL:`** is a tunnel host (for example `*.trycloudflare.com`), **not** `example.com`. That line is what you paste into Dev Dashboard **URLs → App URL** if you edit manually.
5. Open the app with **`p`** (Open app preview) or the **Preview URL** printed by the CLI — not an old Admin bookmark.

`shopify.app.toml` keeps `example.com` only as a placeholder for validation; **`pnpm dev`** should override it when `shopify.web.toml` is present.

### App routes (Phase 3 shell)

| Path | Purpose |
|------|---------|
| `/app` | Home |
| `/app/products` | Browse / search (GraphQL wiring next) |
| `/app/selected` | Selected products |
| `/app/selected/configure?productGid=…` | Design file uploads (S3, Phase 4) |
| `/app/submissions` | Submission status |
| `/app/settings` | Store & supplier link (Phase 5) |

Phase 5 supplier linking: [docs/phase-5-supplier-link.md](./docs/phase-5-supplier-link.md)

Phase 9 E2E (dev store): [docs/phase-9-e2e-dev-store.md](./docs/phase-9-e2e-dev-store.md) · run `pnpm e2e:smoke` with tunnel + Employee API up

## Railway

Project **wonderful-adventure** · app service **ethos-merchant-shopify** → https://ethos-merchant-shopify-production.up.railway.app · Postgres holds integration data.

**Deploy after merge to `main`:**

1. **CI must pass** (GitHub Actions). A red CI email does **not** roll back production; it only means that commit was not validated.
2. **Production app:** either add a GitHub secret `RAILWAY_TOKEN` (Railway → Project → Settings → Tokens) so the **Deploy** workflow runs after green CI, or from this repo run `railway up -y -d` (requires Railway CLI login).
3. **Shopify app URL / webhooks:** `pnpm run deploy -- --allow-updates --no-build` (Partner CLI auth on your machine).

In Railway, connect the service to **`willhunt1994/ethos-merchant`** (not the legacy `ethos-merchant-shopify` repo) if you want GitHub push deploys without `railway up`.
