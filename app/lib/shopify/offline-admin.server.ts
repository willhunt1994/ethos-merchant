import { unauthenticated } from "../../shopify.server";

type ShopifyAdmin = Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];

export async function loadOfflineAdminForShop(shopDomain: string): Promise<ShopifyAdmin | null> {
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    return admin;
  } catch (e) {
    console.warn(`[shopify] no offline session for ${shopDomain}`, e);
    return null;
  }
}
