import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { assertEthosIntegrationAuthorized } from "../lib/integration-auth.server";
import { upsertShopSupplierLink } from "../lib/shop-supplier.server";

const bodySchema = z.object({
  shopDomain: z.string().min(3).regex(/\.myshopify\.com$/i, "shopDomain must be a *.myshopify.com domain"),
  ethosSupplierId: z.number().int().positive(),
  ethosSupplierSlug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase alphanumeric with hyphens"),
  approvalStatus: z.enum(["pending", "approved", "rejected"]),
  approvedByUserRef: z.string().max(128).optional().nullable(),
});

export const action = async ({ request }: ActionFunctionArgs) => {
  const authError = assertEthosIntegrationAuthorized(request);
  if (authError) return authError;

  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const link = await upsertShopSupplierLink({
    shopDomain: data.shopDomain.toLowerCase(),
    ethosSupplierId: data.ethosSupplierId,
    ethosSupplierSlug: data.ethosSupplierSlug.toLowerCase(),
    approvalStatus: data.approvalStatus,
    approvedByUserRef: data.approvedByUserRef ?? null,
  });

  return Response.json({
    ok: true,
    link: {
      id: link.id,
      shopDomain: data.shopDomain,
      ethosSupplierId: link.ethosSupplierId,
      ethosSupplierSlug: link.ethosSupplierSlug,
      approvalStatus: link.approvalStatus,
      approvedAt: link.approvedAt?.toISOString() ?? null,
      approvedByUserRef: link.approvedByUserRef,
    },
  });
};
