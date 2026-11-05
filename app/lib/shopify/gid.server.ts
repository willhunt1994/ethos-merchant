export function shopifyGid(resource: string, numericId: number | string): string {
  return `gid://shopify/${resource}/${numericId}`;
}

export function numericIdFromShopifyGid(gid: string): string | null {
  const match = gid.match(/\/(\d+)$/);
  return match?.[1] ?? null;
}

export function productGidFromWebhookPayload(payload: Record<string, unknown>): string | null {
  const gql = payload.admin_graphql_api_id;
  if (typeof gql === "string" && gql.startsWith("gid://")) return gql;
  const id = payload.id;
  if (typeof id === "number" && Number.isFinite(id)) return shopifyGid("Product", id);
  if (typeof id === "string" && /^\d+$/.test(id)) return shopifyGid("Product", id);
  return null;
}

export function variantGidFromWebhookVariant(variant: Record<string, unknown>): string | null {
  const gql = variant.admin_graphql_api_id;
  if (typeof gql === "string" && gql.startsWith("gid://")) return gql;
  const id = variant.id;
  if (typeof id === "number" && Number.isFinite(id)) return shopifyGid("ProductVariant", id);
  if (typeof id === "string" && /^\d+$/.test(id)) return shopifyGid("ProductVariant", id);
  return null;
}
