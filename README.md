# ethos-merchant

Ethos merchant app — local development in this folder, deployed via Railway (`wonderful-adventure`).

## GitHub

- Remote: `git@github.com:willhunt1994/ethos-merchant.git`
- Default branch: `main`

## Railway

- Project: **wonderful-adventure** (production)
- Linked Postgres service: **Postgres**
- CLI (from this folder): `railway status`, `railway variable list`

Copy `.env.example` to `.env` and set `DATABASE_URL`, or pull credentials with:

```bash
railway link -p wonderful-adventure -e production
railway service link Postgres
```

If the public TCP proxy is slow or blocked, use an SSH tunnel:

```bash
railway connect Postgres --ssh --tunnel-only -P 15432
```

Then point your client at `127.0.0.1:15432` (swap `DATABASE_URL` to the commented local URL in `.env`).
