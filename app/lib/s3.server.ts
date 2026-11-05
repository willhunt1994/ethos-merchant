import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let client: S3Client | null = null;

function getAwsConfig() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const region = process.env.AWS_REGION?.trim() || "us-east-2";
  const bucket = process.env.AWS_S3_BUCKET?.trim();
  const prefix =
    process.env.MERCHANT_UPLOAD_S3_PREFIX?.trim() || "merchant-submissions";
  return { accessKeyId, secretAccessKey, region, bucket, prefix };
}

/** IAM access keys must be plain ASCII; truncated/redacted paste often includes U+2026 (…). */
function awsCredentialFieldError(name: string, value: string | undefined): string | null {
  if (!value?.trim()) return `${name} is not set`;
  const v = value.trim();
  if (v.includes("\u2026") || v.includes("…")) {
    return `${name} looks truncated (contains "…"). Paste the full key from AWS IAM into .env with no ellipsis.`;
  }
  if (!/^[\x21-\x7E]+$/.test(v)) {
    return `${name} contains invalid characters. Re-copy it from AWS IAM as plain text only.`;
  }
  return null;
}

export function getMerchantS3ConfigError(): string | null {
  const { accessKeyId, secretAccessKey, bucket } = getAwsConfig();
  if (!bucket) return "AWS_S3_BUCKET is not set";
  return (
    awsCredentialFieldError("AWS_ACCESS_KEY_ID", accessKeyId) ??
    awsCredentialFieldError("AWS_SECRET_ACCESS_KEY", secretAccessKey)
  );
}

export function isMerchantS3Configured(): boolean {
  const { accessKeyId, secretAccessKey, bucket } = getAwsConfig();
  return Boolean(accessKeyId && secretAccessKey && bucket && !getMerchantS3ConfigError());
}

function getClient(): S3Client {
  const configError = getMerchantS3ConfigError();
  if (configError) {
    throw new Error(configError);
  }
  const { accessKeyId, secretAccessKey, region } = getAwsConfig();
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials are not configured");
  }
  if (!client) {
    client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

function safePathSegment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "_";
  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

/** Staging prefix until Employee assigns supplier + item_code (Phase 6 registers CAD rows). */
export function merchantAttachmentKeyPrefix(shopDomain: string, shopifyProductGid: string): string {
  const { prefix } = getAwsConfig();
  const productKey = safePathSegment(shopifyProductGid.replace(/^gid:\/\/shopify\/Product\//, "product_"));
  return `${prefix}/${safePathSegment(shopDomain)}/${productKey}/`;
}

export function merchantAttachmentStorageKey(
  shopDomain: string,
  shopifyProductGid: string,
  filename: string,
): string {
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() || "bin" : "bin";
  return `${merchantAttachmentKeyPrefix(shopDomain, shopifyProductGid)}${randomUUID()}.${ext}`;
}

export function isValidMerchantAttachmentKey(
  shopDomain: string,
  shopifyProductGid: string,
  storageKey: string,
): boolean {
  const expected = merchantAttachmentKeyPrefix(shopDomain, shopifyProductGid);
  return storageKey.startsWith(expected) && !storageKey.includes("..");
}

export async function putPrivateObject(
  storageKey: string,
  body: Uint8Array | Buffer,
  contentType: string,
): Promise<void> {
  const { bucket } = getAwsConfig();
  if (!bucket) throw new Error("AWS_S3_BUCKET is not configured");
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }),
  );
}

export async function createPresignedPutObjectUrl(
  storageKey: string,
  contentType: string,
  expiresSeconds = 3600,
): Promise<string> {
  const { bucket } = getAwsConfig();
  if (!bucket) throw new Error("AWS_S3_BUCKET is not configured");
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: expiresSeconds });
}

export async function getPrivateObject(storageKey: string): Promise<Uint8Array> {
  const { bucket } = getAwsConfig();
  if (!bucket) throw new Error("AWS_S3_BUCKET is not configured");
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }),
  );
  const body = await response.Body?.transformToByteArray();
  if (!body?.length) {
    throw new Error("Empty object from S3");
  }
  return body;
}

export async function deletePrivateObject(storageKey: string): Promise<void> {
  if (!isMerchantS3Configured()) return;
  const { bucket } = getAwsConfig();
  if (!bucket) return;
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }),
  );
}
