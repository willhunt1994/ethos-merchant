import { isLocalPreviewEnabled } from "../config/env.server";

export const PREVIEW_SHOP_DOMAIN = "preview-ethos-merchant.myshopify.com";

export function assertPreviewSafe(): void {
  if (isLocalPreviewEnabled() && process.env.NODE_ENV === "production") {
    throw new Error("LOCAL_PREVIEW cannot be enabled in production");
  }
}
