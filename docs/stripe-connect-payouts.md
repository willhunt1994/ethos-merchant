# Stripe Connect payouts (merchant app)

PCI-safe pattern: bank account numbers never touch Ethos servers. The merchant app stores only Stripe Connect account IDs and cached status on `Shop`.

## Dashboard (Test mode first)

1. **Connect** → Get started → choose **Express** accounts (platform receives payments / pays out merchants per your business model).
2. **Developers → API keys**: copy the platform **Secret** test key → `STRIPE_SECRET_KEY` on the merchant Railway service.
3. **Developers → Webhooks** → Add endpoint:
   - URL: `https://<merchant-app-host>/webhooks/stripe-connect`
   - Listen to: **Connect** events on your platform account
   - Events:
     - `account.updated`
     - `capability.updated`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET_CONNECT`.

Optional: set `STRIPE_CONNECT_RETURN_URL` to `{SHOPIFY_APP_URL}/app/settings?payout=return` (default derived from `SHOPIFY_APP_URL`).

## Local webhooks

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe-connect
```

Use the CLI signing secret in `.env` as `STRIPE_WEBHOOK_SECRET_CONNECT`.

## Environment variables (merchant app)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Platform secret key |
| `STRIPE_WEBHOOK_SECRET_CONNECT` | Webhook signing secret for Connect endpoint |
| `STRIPE_CONNECT_RETURN_URL` | Optional return URL after hosted onboarding |

## Ethos control

- `Shop.ethosPayoutsEnabled` defaults to **false** until Ethos ops enables payouts in **Employee admin** (`/products/merchant-payouts`).
- Effective payout readiness requires Stripe `payouts_enabled` **and** `ethosPayoutsEnabled`.

## Employee API

Set `SHOPIFY_MERCHANT_APP_URL` to the merchant app origin (no trailing slash), e.g. `https://ethos-merchant-shopify-production.up.railway.app`. Uses the same shared secret as `SHOPIFY_MERCHANT_INTEGRATION_API_KEY` / merchant `ETHOS_INTEGRATION_API_KEY`.
