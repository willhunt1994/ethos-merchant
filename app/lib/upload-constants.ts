export const ATTACHMENT_CATEGORIES = [
  { value: "brand_guidelines", label: "Brand guidelines" },
  { value: "product_design", label: "Product design" },
  { value: "tech_pack", label: "Tech pack / spec" },
  { value: "other", label: "Other" },
] as const;

export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number]["value"];

export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "ai",
  "eps",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "docx",
]);

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/postscript",
  "application/illustrator",
  "application/vnd.adobe.illustrator",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);

export function extensionFromFilename(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "bin";
  return (parts.pop() ?? "bin").toLowerCase();
}

export function isAllowedDesignUpload(filename: string, contentType: string): boolean {
  const ext = extensionFromFilename(filename);
  if (ALLOWED_EXTENSIONS.has(ext)) return true;
  const mime = contentType.trim().toLowerCase();
  if (ALLOWED_MIMES.has(mime)) return true;
  if (mime === "application/octet-stream" && ALLOWED_EXTENSIONS.has(ext)) return true;
  return false;
}
