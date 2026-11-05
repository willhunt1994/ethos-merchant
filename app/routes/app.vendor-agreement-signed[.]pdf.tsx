import type { LoaderFunctionArgs } from "react-router";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import prisma from "../db.server";
import { buildVendorAgreementSignedPdf } from "../lib/vendor-agreement-pdf.server";
import { resolveVendorAgreementState } from "../lib/vendor-agreement-preview-mock.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
  const previewMode = ctx.mode === "preview";
  const { agreement } = resolveVendorAgreementState(request, shop, previewMode);

  if (!agreement.isSigned || !agreement.isCurrentVersion) {
    throw new Response("Signed agreement not available", { status: 404 });
  }

  const pdf = await buildVendorAgreementSignedPdf(agreement);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="ethos-vendor-agreement-signed.pdf"',
      "Cache-Control": "private, max-age=300",
    },
  });
};
