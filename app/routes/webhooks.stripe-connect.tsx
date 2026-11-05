import type { ActionFunctionArgs } from "react-router";
import { handleStripeConnectWebhook } from "../lib/stripe/connect-webhook.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return handleStripeConnectWebhook(request);
};
