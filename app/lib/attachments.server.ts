import type { ProductAttachment } from "@prisma/client";
import prisma from "../db.server";
import { deletePrivateObject } from "./s3.server";

export type ClientProductAttachment = {
  id: string;
  filename: string;
  category: string;
  label: string | null;
  status: string;
  storageKey: string;
  contentType: string;
  byteSize: number | null;
  createdAt: string;
  updatedAt: string;
};

export function toClientProductAttachment(row: ProductAttachment): ClientProductAttachment {
  return {
    id: row.id,
    filename: row.filename,
    category: row.category,
    label: row.label,
    status: row.status,
    storageKey: row.storageKey,
    contentType: row.contentType,
    byteSize: row.byteSize != null ? Number(row.byteSize) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listProductAttachments(shopDomain: string, shopifyProductGid: string) {
  return prisma.productAttachment.findMany({
    where: { shopDomain, shopifyProductGid, status: { not: "failed" } },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteProductAttachment(
  shopDomain: string,
  attachmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.productAttachment.findFirst({
    where: { id: attachmentId, shopDomain },
  });
  if (!row) return { ok: false, error: "Attachment not found" };
  if (!row.storageKey.startsWith("local-preview://")) {
    try {
      await deletePrivateObject(row.storageKey);
    } catch {
      // Still remove DB row if object already gone
    }
  }
  await prisma.productAttachment.delete({ where: { id: row.id } });
  return { ok: true };
}
