import Stripe from "stripe";
import { applyStripeAccountByConnectId, requireStripe } from "./connect.server";

function webhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET_CONNECT?.trim() || null;
}

export function isStripeConnectWebhookConfigured(): boolean {
  return Boolean(webhookSecret() && process.env.STRIPE_SECRET_KEY?.trim());
}

export async function handleStripeConnectWebhook(request: Request): Promise<Response> {
  const secret = webhookSecret();
  if (!secret) {
    return Response.json({ error: "Stripe Connect webhook is not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = requireStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return Response.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await applyStripeAccountByConnectId(account);
      break;
    }
    case "capability.updated": {
      const capability = event.data.object as Stripe.Capability;
      const accountId =
        typeof capability.account === "string"
          ? capability.account
          : capability.account?.id;
      if (accountId) {
        const account = await stripe.accounts.retrieve(accountId);
        await applyStripeAccountByConnectId(account);
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
}
