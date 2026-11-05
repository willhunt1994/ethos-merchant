/** PNG data URL from the in-app signature pad. */
export const DRAWN_SIGNATURE_PREFIX = "data:image/png;base64,";

export function isDrawnVendorSignature(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(DRAWN_SIGNATURE_PREFIX));
}

export const MAX_DRAWN_SIGNATURE_LENGTH = 400_000;

export function validateDrawnVendorSignature(signatureText: string): string | null {
  if (!isDrawnVendorSignature(signatureText)) {
    return "Drawn signature data is invalid.";
  }
  if (signatureText.length > MAX_DRAWN_SIGNATURE_LENGTH) {
    return "Signature image is too large. Clear and draw again.";
  }
  return null;
}
