import type { Shop } from "@prisma/client";
import prisma from "../db.server";
import {
  deletePrivateObject,
  getMerchantS3ConfigError,
  isMerchantS3Configured,
  putPrivateObject,
} from "./s3.server";

const MAX_W9_FORM_BYTES = 15 * 1024 * 1024;

function safePathSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "_";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export function merchantW9StorageKey(shopDomain: string, filename: string): string {
  const prefix = process.env.MERCHANT_UPLOAD_S3_PREFIX?.trim() || "merchant-submissions";
  return `${prefix}/w9/${safePathSegment(shopDomain)}/${Date.now()}-${safePathSegment(filename)}`;
}

export type W9FormView = {
  uploaded: boolean;
  filename: string | null;
  uploadedAt: string | null;
  verified: boolean;
  verifiedAt: string | null;
};

export function w9FormViewFromShop(shop: Shop | null): W9FormView {
  const uploaded = Boolean(shop?.w9FormStorageKey && shop.w9FormUploadedAt);
  return {
    uploaded,
    filename: shop?.w9FormFilename ?? null,
    uploadedAt: shop?.w9FormUploadedAt?.toISOString() ?? null,
    verified: Boolean(shop?.w9FormVerifiedAt),
    verifiedAt: shop?.w9FormVerifiedAt?.toISOString() ?? null,
  };
}

export function validateW9FormUpload(filename: string, byteSize: number): string | null {
  if (byteSize <= 0) return "Choose a PDF file to upload.";
  if (byteSize > MAX_W9_FORM_BYTES) return "W-9 file must be 15 MB or smaller.";
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".pdf")) return "W-9 must be a PDF file.";
  return null;
}

export async function saveShopW9FormUpload(input: {
  shopDomain: string;
  filename: string;
  contentType: string;
  body: Buffer;
  previewStub: boolean;
}): Promise<{ ok: true; form: W9FormView } | { ok: false; error: string }> {
  const validationError = validateW9FormUpload(input.filename, input.body.byteLength);
  if (validationError) return { ok: false, error: validationError };

  const shop = await prisma.shop.findUnique({ where: { shopDomain: input.shopDomain } });
  const storageKey = input.previewStub
    ? `local-preview://w9/${input.shopDomain}/${Date.now()}-${input.filename}`
    : merchantW9StorageKey(input.shopDomain, input.filename);

  if (!input.previewStub) {
    const s3Error = getMerchantS3ConfigError();
    if (s3Error) return { ok: false, error: s3Error };
  }

  if (shop?.w9FormStorageKey && !shop.w9FormStorageKey.startsWith("local-preview://")) {
    try {
      await deletePrivateObject(shop.w9FormStorageKey);
    } catch {
      /* object may already be gone */
    }
  }

  if (!input.previewStub) {
    try {
      await putPrivateObject(storageKey, input.body, input.contentType || "application/pdf");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not upload W-9 to storage.";
      return { ok: false, error: message };
    }
  }

  const updated = await prisma.shop.upsert({
    where: { shopDomain: input.shopDomain },
    create: {
      shopDomain: input.shopDomain,
      w9FormStorageKey: storageKey,
      w9FormFilename: input.filename,
      w9FormContentType: input.contentType || "application/pdf",
      w9FormUploadedAt: new Date(),
      w9FormVerifiedAt: null,
    },
    update: {
      w9FormStorageKey: storageKey,
      w9FormFilename: input.filename,
      w9FormContentType: input.contentType || "application/pdf",
      w9FormUploadedAt: new Date(),
      w9FormVerifiedAt: null,
    },
  });

  return { ok: true, form: w9FormViewFromShop(updated) };
}

export async function setShopW9FormVerified(input: {
  shopDomain: string;
  verified: boolean;
}): Promise<W9FormView> {
  const shop = await prisma.shop.upsert({
    where: { shopDomain: input.shopDomain },
    create: {
      shopDomain: input.shopDomain,
      w9FormVerifiedAt: input.verified ? new Date() : null,
    },
    update: {
      w9FormVerifiedAt: input.verified ? new Date() : null,
    },
  });
  return w9FormViewFromShop(shop);
}

export function canDownloadW9Form(shop: Shop | null): boolean {
  if (!shop?.w9FormStorageKey || !shop.w9FormUploadedAt) return false;
  if (shop.w9FormStorageKey.startsWith("local-preview://")) return false;
  return isMerchantS3Configured();
}
