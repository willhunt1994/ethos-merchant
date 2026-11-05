import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { assertEthosIntegrationAuthorized } from "../lib/integration-auth.server";
import {
  clearEthosVendorAgreementCounterSign,
  getVendorAgreementSnapshot,
  listVendorAgreementSnapshots,
  recordEthosVendorAgreementCounterSign,
} from "../lib/shop-vendor-agreement.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authError = assertEthosIntegrationAuthorized(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shopDomain")?.trim().toLowerCase() || undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const pendingOnly = url.searchParams.get("pendingEthosSign") === "1";

  if (shopDomain) {
    const snapshot = await getVendorAgreementSnapshot(shopDomain);
    if (!snapshot) {
      return Response.json({ ok: false, error: "Shop not found" }, { status: 404 });
    }
    return Response.json({ ok: true, vendorAgreement: snapshot });
  }

  let agreements = await listVendorAgreementSnapshots({ limit });
  if (pendingOnly) {
    agreements = agreements.filter((a) => a.vendorAgreementComplete && !a.ethosCounterSigned);
  }
  return Response.json({ ok: true, vendorAgreements: agreements });
};

const patchSchema = z.object({
  shopDomain: z.string().min(3).regex(/\.myshopify\.com$/i),
  ethosSignatoryName: z.string().min(1).max(200).optional(),
  ethosSignatoryTitle: z.string().min(1).max(200).optional(),
  signedByUserRef: z.string().max(200).nullable().optional(),
  clearEthosCounterSign: z.boolean().optional(),
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

  const shopDomain = parsed.data.shopDomain.toLowerCase();

  try {
    if (parsed.data.clearEthosCounterSign) {
      const vendorAgreement = await clearEthosVendorAgreementCounterSign(shopDomain);
      return Response.json({ ok: true, vendorAgreement });
    }

    if (!parsed.data.ethosSignatoryName || !parsed.data.ethosSignatoryTitle) {
      return Response.json(
        {
          ok: false,
          error: "ethosSignatoryName and ethosSignatoryTitle are required to counter-sign",
        },
        { status: 400 },
      );
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
    const vendorAgreement = await recordEthosVendorAgreementCounterSign({
      shopDomain,
      signatoryName: parsed.data.ethosSignatoryName,
      signatoryTitle: parsed.data.ethosSignatoryTitle,
      signedByUserRef: parsed.data.signedByUserRef,
      requestMeta: { ip, userAgent: request.headers.get("user-agent") },
    });
    return Response.json({ ok: true, vendorAgreement });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
};
