type ShopifyAdmin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export type ShopifyConfigureVariant = {
  id: string;
  title: string;
  sku: string | null;
  shopifyPrice: string;
  inventoryQuantity: number;
  color: string;
  size: string;
};

const CONFIGURE_VARIANTS_QUERY = `#graphql
  query EthosConfigureVariants($id: ID!, $first: Int!) {
    product(id: $id) {
      id
      title
      productType
      variants(first: $first) {
        nodes {
          id
          title
          displayName
          sku
          inventoryQuantity
          inventoryItem {
            unitCost {
              amount
            }
          }
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

export function mapShopifyVariantOptions(
  selectedOptions: Array<{ name: string; value: string }>,
  fallbackTitle?: string,
): { color: string; size: string } {
  let color = "Default";
  let size = "One Size";
  for (const opt of selectedOptions) {
    const n = opt.name.toLowerCase();
    if (n.includes("color") || n.includes("colour")) {
      color = opt.value.trim() || color;
    } else if (n.includes("size")) {
      size = opt.value.trim() || size;
    }
  }
  if (color === "Default" && size === "One Size" && fallbackTitle?.trim()) {
    const parts = fallbackTitle.split("/").map((p) => p.trim());
    if (parts.length >= 2) {
      color = parts[0] || color;
      size = parts.slice(1).join(" / ") || size;
    }
  }
  return { color, size };
}

export async function fetchConfigureVariants(
  admin: ShopifyAdmin,
  productGid: string,
): Promise<{ productType: string | null; variants: ShopifyConfigureVariant[] }> {
  const response = await admin.graphql(CONFIGURE_VARIANTS_QUERY, {
    variables: { id: productGid, first: 100 },
  });
  const json = (await response.json()) as {
    data?: {
      product?: {
        productType?: string | null;
        variants?: {
          nodes: Array<{
            id: string;
            title: string;
            displayName?: string | null;
            sku?: string | null;
            inventoryQuantity?: number | null;
            inventoryItem?: { unitCost?: { amount?: string | null } | null } | null;
            selectedOptions?: Array<{ name: string; value: string }>;
          }>;
        };
      };
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const product = json.data?.product;
  const nodes = product?.variants?.nodes ?? [];
  const variants = nodes.map((node) => {
    const { color, size } = mapShopifyVariantOptions(node.selectedOptions ?? [], node.title);
    const costAmount = node.inventoryItem?.unitCost?.amount?.trim();
    const title =
      node.displayName?.trim() || node.title?.trim() || node.id;
    return {
      id: node.id,
      title,
      sku: node.sku?.trim() || null,
      /** Merchant cost per unit from Shopify (InventoryItem.unitCost), not retail price. */
      shopifyPrice: costAmount ? costAmount : "—",
      inventoryQuantity: node.inventoryQuantity ?? 0,
      color,
      size,
    };
  });

  return { productType: product?.productType ?? null, variants };
}
