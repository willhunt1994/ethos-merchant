import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { assertEthosIntegrationAuthorized } from "../lib/integration-auth.server";
import {
  getShopPayoutSnapshot,
  listShopPayoutSnapshots,
  updateEthosPayoutControl,
} from "../lib/shop-payout.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authError = assertEthosIntegrationAuthorized(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shopDomain")?.trim().toLowerCase() || undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (shopDomain) {
    const snapshot = await getShopPayoutSnapshot(shopDomain);
    if (!snapshot) {
      return Response.json({ ok: false, error: "Shop not found" }, { status: 404 });
    }
    return Response.json({ ok: true, payout: snapshot });
  }

  const payouts = await listShopPayoutSnapshots({ limit });
  return Response.json({ ok: true, payouts });
};

const patchSchema = z.object({
  shopDomain: z.string().min(3).regex(/\.myshopify\.com$/i),
  ethosPayoutsEnabled: z.boolean().optional(),
  ethosPayoutsNote: z.string().max(4000).nullable().optional(),
  w9FormVerified: z.boolean().optional(),
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const authError = assertEthosIntegrationAuthorized(request);
  if (authError) return authError;

  if (request.method !== "PATCH") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const payout = await updateEthosPayoutControl({
    shopDomain: parsed.data.shopDomain.toLowerCase(),
    ethosPayoutsEnabled: parsed.data.ethosPayoutsEnabled,
    ethosPayoutsNote: parsed.data.ethosPayoutsNote,
    w9FormVerified: parsed.data.w9FormVerified,
  });

  return Response.json({ ok: true, payout });
};
