# Vendor Registration & Marketplace Participation Agreement

## In-app flow

Merchants accept the agreement in **Settings → Vendor Agreement**:

1. Review scrollable agreement text (version `draft-2026-11-v1.1`, synced with the PDF draft).
2. Complete vendor registration fields (legal name, entity, address, contacts).
3. Review and **accept Schedule A** standard commercial terms (optional written exceptions in notes).
4. Save a draft or **Accept agreement** (store owner only) with Section 19/20 checkboxes and typed e-signature.

## Gating

| Action | Requirement |
|--------|-------------|
| Submit products to Ethos | Current agreement signed + Schedule A complete |
| Connect payout bank (Stripe) | Fully executed agreement (vendor sign + Schedule A + **Ethos countersignature**) |

## Storage

Accepted records live on `Shop`:

- Registration fields (`vendorAgreementLegalName`, …)
- `vendorAgreementVersion`, `vendorAgreementSignedAt`
- `vendorAgreementAudit` (JSON: version, timestamp, IP, user agent)
- `vendorAgreementScheduleA` (JSON: `{ version, termsAccepted, additionalTerms? }`)
- Ethos acceptance: `vendorAgreementEthosSignedAt`, signatory name/title, `vendorAgreementEthosSignedByRef`, `vendorAgreementEthosSignAudit`

Re-signing the vendor agreement clears Ethos countersignature fields until Ethos accepts again.

## Ethos countersignature (integration API)

Service-authenticated endpoints (same auth as `shop-payout`):

- `GET /integrations/shopify/v1/shop-vendor-agreement?shopDomain=…` — snapshot for one shop
- `GET /integrations/shopify/v1/shop-vendor-agreement?pendingEthosSign=1&limit=50` — vendors awaiting Ethos sign
- `PATCH /integrations/shopify/v1/shop-vendor-agreement` — counter-sign or clear

Counter-sign body:

```json
{
  "shopDomain": "store.myshopify.com",
  "ethosSignatoryName": "Jane Doe",
  "ethosSignatoryTitle": "Authorized Representative",
  "signedByUserRef": "employee-user-123"
}
```

Clear countersignature (e.g. after vendor re-signs on a new version):

```json
{
  "shopDomain": "store.myshopify.com",
  "clearEthosCounterSign": true
}
```

## PDF

Static copy: [`/legal/ethos-vendor-marketplace-agreement.pdf`](../public/legal/ethos-vendor-marketplace-agreement.pdf)

## Configuration

- `ETHOS_LEGAL_ENTITY_NAME` — Ethos counterparty name in the agreement intro (optional).

## Legal

The PDF and in-app text are **draft for legal review**. Section 5.1 (minimum retail price) must not be enforced until antitrust counsel approves.

## Migration

```bash
pnpm exec prisma migrate deploy
```
