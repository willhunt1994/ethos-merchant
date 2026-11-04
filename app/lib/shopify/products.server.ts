type ShopifyAdmin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export type ShopifyProductsPage = {
  products: ShopifyProductRow[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    endCursor: string | null;
    startCursor: string | null;
  };
};

export type ShopifyProductRow = {
  id: string;
  title: string;
  status: string;
  productType: string;
  vendor: string;
  imageUrl: string | null;
  variantCount: number;
  totalInventory: number;
  priceFrom: string;
  currencyCode: string;
  primarySku: string | null;
};

const PRODUCTS_PAGE_QUERY = `#graphql
  query EthosProductsBrowser($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: TITLE) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
        startCursor
      }
      nodes {
        id
        title
        status
        productType
        vendor
        totalInventory
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        variantsCount {
          count
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 1) {
          nodes {
            sku
            inventoryItem {
              sku
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_VARIANTS_QUERY = `#graphql
  query EthosProductVariants($id: ID!, $first: Int!) {
    product(id: $id) {
      id
      variants(first: $first) {
        nodes {
          id
        }
      }
    }
  }
`;

function buildShopifySearchQuery(input: {
  q?: string;
  status?: string;
  vendor?: string;
  productType?: string;
  submittedFilter?: string;
}): string | undefined {
  const parts: string[] = [];
  const q = input.q?.trim();
  if (q) {
    parts.push(`title:*${q.replace(/"/g, "")}*`);
  }
  if (input.status?.trim()) {
    parts.push(`status:${input.status.trim()}`);
  }
  if (input.vendor?.trim()) {
    parts.push(`vendor:${input.vendor.trim()}`);
  }
  if (input.productType?.trim()) {
    parts.push(`product_type:${input.productType.trim()}`);
  }
  if (parts.length === 0) return undefined;
  return parts.join(" ");
}

export async function fetchProductsPage(
  admin: ShopifyAdmin,
  options: {
    first?: number;
    after?: string | null;
    q?: string;
    status?: string;
    vendor?: string;
    productType?: string;
  },
): Promise<ShopifyProductsPage> {
  const first = Math.min(Math.max(options.first ?? 24, 1), 50);
  const query = buildShopifySearchQuery(options);

  const response = await admin.graphql(PRODUCTS_PAGE_QUERY, {
    variables: {
      first,
      after: options.after || null,
      query: query ?? null,
    },
  });

  const json = (await response.json()) as {
    data?: {
      products?: {
        pageInfo: ShopifyProductsPage["pageInfo"];
        nodes: Array<{
          id: string;
          title: string;
          status: string;
          productType: string;
          vendor: string;
          totalInventory: number;
          featuredMedia?: { preview?: { image?: { url?: string } } } | null;
          variantsCount?: { count: number } | null;
          priceRangeV2?: {
            minVariantPrice?: { amount: string; currencyCode: string };
          };
          variants?: {
            nodes: Array<{ sku?: string | null; inventoryItem?: { sku?: string | null } | null }>;
          };
        }>;
      };
    };
    errors?: unknown;
  };

  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const connection = json.data?.products;
  const nodes = connection?.nodes ?? [];

  const products: ShopifyProductRow[] = nodes.map((node) => {
    const variant = node.variants?.nodes?.[0];
    const sku = variant?.sku?.trim() || variant?.inventoryItem?.sku?.trim() || null;
    const minPrice = node.priceRangeV2?.minVariantPrice;
    return {
      id: node.id,
      title: node.title,
      status: node.status,
      productType: node.productType ?? "",
      vendor: node.vendor ?? "",
      imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
      variantCount: node.variantsCount?.count ?? 0,
      totalInventory: node.totalInventory ?? 0,
      priceFrom: minPrice?.amount ?? "0.00",
      currencyCode: minPrice?.currencyCode ?? "USD",
      primarySku: sku,
    };
  });

  return {
    products,
    pageInfo: connection?.pageInfo ?? {
      hasNextPage: false,
      hasPreviousPage: false,
      endCursor: null,
      startCursor: null,
    },
  };
}

const PRODUCT_NODES_QUERY = `#graphql
  query EthosProductNodes($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
      }
    }
  }
`;

export async function fetchProductSummariesByGids(
  admin: ShopifyAdmin,
  ids: string[],
): Promise<Map<string, { title: string; imageUrl: string | null }>> {
  const out = new Map<string, { title: string; imageUrl: string | null }>();
  if (ids.length === 0) return out;

  const response = await admin.graphql(PRODUCT_NODES_QUERY, { variables: { ids } });
  const json = (await response.json()) as {
    data?: {
      nodes?: Array<{
        id?: string;
        title?: string;
        featuredMedia?: { preview?: { image?: { url?: string } } } | null;
      } | null>;
    };
  };

  for (const node of json.data?.nodes ?? []) {
    if (!node?.id) continue;
    out.set(node.id, {
      title: node.title ?? node.id,
      imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
    });
  }
  return out;
}

export async function fetchProductVariantGids(
  admin: ShopifyAdmin,
  productGid: string,
): Promise<string[]> {
  const response = await admin.graphql(PRODUCT_VARIANTS_QUERY, {
    variables: { id: productGid, first: 100 },
  });
  const json = (await response.json()) as {
    data?: { product?: { variants?: { nodes: Array<{ id: string }> } } };
  };
  return json.data?.product?.variants?.nodes.map((v) => v.id) ?? [];
}
