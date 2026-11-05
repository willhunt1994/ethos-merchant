import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { canDownloadW9Form } from "../lib/w9-form.server";
import { getPrivateObject, isMerchantS3Configured } from "../lib/s3.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
  if (!shop || !canDownloadW9Form(shop)) {
    throw new Response("Not found", { status: 404 });
  }
  if (!isMerchantS3Configured() || !shop.w9FormStorageKey) {
    throw new Response("File storage unavailable", { status: 503 });
  }

  const bytes = await getPrivateObject(shop.w9FormStorageKey);
  const filename = shop.w9FormFilename?.replace(/"/g, "") || "w9.pdf";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": shop.w9FormContentType || "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
};
