import { authenticate } from "../shopify.server";
import { isLocalPreviewEnabled } from "../config/env.server";
import { PREVIEW_SHOP_DOMAIN } from "./local-preview.server";

type ShopifyAdminContext = Awaited<ReturnType<typeof authenticate.admin>>;

export type MerchantContext =
  | { mode: "preview"; shopDomain: typeof PREVIEW_SHOP_DOMAIN; admin: null }
  | { mode: "shopify"; shopDomain: string; admin: ShopifyAdminContext["admin"] };

export async function requireMerchantContext(request: Request): Promise<MerchantContext> {
  if (isLocalPreviewEnabled()) {
    return { mode: "preview", shopDomain: PREVIEW_SHOP_DOMAIN, admin: null };
  }
  const { admin, session } = await authenticate.admin(request);
  return { mode: "shopify", shopDomain: session.shop, admin };
}
