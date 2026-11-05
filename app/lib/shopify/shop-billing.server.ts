type ShopifyAdmin = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

export type ShopBillingProfile = {
  legalBusinessName: string;
  businessAddress: string;
  source: "shopify" | "preview";
};

const SHOP_BILLING_QUERY = `#graphql
  query EthosShopBillingProfile {
    shop {
      name
      billingAddress {
        company
        address1
        address2
        city
        province
        zip
        country
      }
    }
  }
`;

function formatBillingAddress(parts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
}): string {
  const lineCity = [parts.city, parts.province, parts.zip].filter(Boolean).join(", ");
  return [parts.address1, parts.address2, lineCity, parts.country].filter(Boolean).join("\n");
}

export async function fetchShopBillingProfile(
  admin: ShopifyAdmin,
): Promise<ShopBillingProfile | null> {
  const response = await admin.graphql(SHOP_BILLING_QUERY);
  const json = (await response.json()) as {
    data?: {
      shop?: {
        name: string;
        billingAddress?: {
          company?: string | null;
          address1?: string | null;
          address2?: string | null;
          city?: string | null;
          province?: string | null;
          zip?: string | null;
          country?: string | null;
        } | null;
      };
    };
    errors?: unknown;
  };

  if (json.errors || !json.data?.shop) {
    return null;
  }

  const shop = json.data.shop;
  const billing = shop.billingAddress;
  const legalBusinessName = billing?.company?.trim() || shop.name?.trim() || "";
  const businessAddress = billing ? formatBillingAddress(billing) : "";

  if (!legalBusinessName && !businessAddress) {
    return null;
  }

  return {
    legalBusinessName,
    businessAddress,
    source: "shopify",
  };
}

export function previewShopBillingProfile(shopDomain: string): ShopBillingProfile {
  const label = shopDomain.replace(".myshopify.com", "").replace(/-/g, " ");
  const title = label ? `${label} LLC` : "Preview Store LLC";
  return {
    legalBusinessName: title,
    businessAddress: "123 Market Street\nSuite 100\nSan Francisco, CA 94105\nUnited States",
    source: "preview",
  };
}
