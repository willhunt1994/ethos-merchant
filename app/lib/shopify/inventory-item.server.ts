import { shopifyGid } from "./gid.server";

type ShopifyAdmin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const INVENTORY_ITEM_VARIANT_QUERY = `#graphql
  query EthosInventoryItemVariant($id: ID!) {
    inventoryItem(id: $id) {
      id
      variant {
        id
        product {
          id
        }
      }
    }
  }
`;

export async function resolveVariantGidForInventoryItem(
  admin: ShopifyAdmin,
  inventoryItemId: number | string,
): Promise<{ shopifyVariantGid: string; shopifyProductGid: string } | null> {
  const id =
    typeof inventoryItemId === "number"
      ? shopifyGid("InventoryItem", inventoryItemId)
      : shopifyGid("InventoryItem", inventoryItemId);

  const response = await admin.graphql(INVENTORY_ITEM_VARIANT_QUERY, { variables: { id } });
  const json = (await response.json()) as {
    data?: {
      inventoryItem?: {
        variant?: { id?: string; product?: { id?: string } | null } | null;
      } | null;
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const variantGid = json.data?.inventoryItem?.variant?.id;
  const productGid = json.data?.inventoryItem?.variant?.product?.id;
  if (!variantGid || !productGid) return null;
  return { shopifyVariantGid: variantGid, shopifyProductGid: productGid };
}
