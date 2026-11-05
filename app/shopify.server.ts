import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { maybeApplyDevSupplierLink } from "./lib/shop-supplier.server";
import { isLocalPreviewEnabled } from "./config/env.server";

/** Partner app client_id from shopify.app.toml — App Bridge only in LOCAL_PREVIEW. */
const PREVIEW_SHOPIFY_API_KEY = "79a36d8400b076734eb79911933f091e";

function resolvedShopifyAppUrl(): string {
  const fromEnv = process.env.SHOPIFY_APP_URL?.trim();
  if (fromEnv) return fromEnv;
  if (isLocalPreviewEnabled()) {
    const port = process.env.PORT?.trim() || "3000";
    return `http://localhost:${port}`;
  }
  return "";
}

function resolvedShopifyCredentials(): { apiKey: string; apiSecretKey: string; scopes: string[] } {
  const preview = isLocalPreviewEnabled();
  const apiKey = process.env.SHOPIFY_API_KEY?.trim() || (preview ? PREVIEW_SHOPIFY_API_KEY : "");
  const apiSecretKey =
    process.env.SHOPIFY_API_SECRET?.trim() ||
    (preview ? "local-preview-shopify-api-secret-not-used" : "");
  const scopes =
    process.env.SCOPES?.split(",").map((s) => s.trim()).filter(Boolean) ??
    (preview ? ["read_products", "read_inventory", "read_locations"] : []);
  return { apiKey, apiSecretKey, scopes };
}

const { apiKey, apiSecretKey, scopes } = resolvedShopifyCredentials();

const shopify = shopifyApp({
  apiKey,
  apiSecretKey,
  apiVersion: ApiVersion.October26,
  scopes,
  appUrl: resolvedShopifyAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma, {
    connectionRetries: 5,
    connectionRetryIntervalMs: 2000,
  }),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop },
        update: { uninstalledAt: null },
      });
      await maybeApplyDevSupplierLink(session.shop);
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
