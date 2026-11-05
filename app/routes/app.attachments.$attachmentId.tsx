import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { getPrivateObject, isMerchantS3Configured } from "../lib/s3.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const attachmentId = params.attachmentId?.trim();
  if (!attachmentId) {
    throw new Response("Not found", { status: 404 });
  }

  const attachment = await prisma.productAttachment.findFirst({
    where: { id: attachmentId, shopDomain: ctx.shopDomain },
  });
  if (!attachment || attachment.status === "failed") {
    throw new Response("Not found", { status: 404 });
  }
  if (attachment.storageKey.startsWith("local-preview://")) {
    throw new Response("Preview file not stored", { status: 404 });
  }
  if (!isMerchantS3Configured()) {
    throw new Response("File storage unavailable", { status: 503 });
  }

  const bytes = await getPrivateObject(attachment.storageKey);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": attachment.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
};
