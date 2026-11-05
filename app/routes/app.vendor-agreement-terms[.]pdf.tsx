import type { LoaderFunctionArgs } from "react-router";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { buildVendorAgreementTermsPdf } from "../lib/vendor-agreement-pdf.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireMerchantContext(request);
  const pdf = await buildVendorAgreementTermsPdf();
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="ethos-vendor-agreement-terms.pdf"',
      "Cache-Control": "private, max-age=300",
    },
  });
};
