import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { runIdempotentWebhook } from "../lib/webhooks/dedupe.server";
import { handleProductsUpdateWebhook } from "../lib/webhook-sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  await runIdempotentWebhook(shop, topic, payload, async () => {
    await handleProductsUpdateWebhook(shop, payload as Record<string, unknown>);
  });

  return new Response(null, { status: 200 });
};
