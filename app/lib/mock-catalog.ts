export type MockCatalogVariant = {
  id: string;
  title: string;
  sku: string;
  /** Retail / compare-at style price in preview (not used as unit cost). */
  price: string;
  /** Unit cost for margin preview (maps to Shopify InventoryItem.unitCost). */
  unitCost: string;
  inventory: number;
  selected?: boolean;
};

export type MockCatalogProduct = {
  id: string;
  title: string;
  status: string;
  productType: string;
  vendor: string;
  imageUrl: string;
  variantCount: number;
  totalInventory: number;
  priceFrom: string;
  submissionStatus: "not_submitted" | "submitted" | "imported" | "needs_attention";
  variants: MockCatalogVariant[];
};

export function findMockCatalogProduct(productGid: string): MockCatalogProduct | undefined {
  return MOCK_CATALOG_PRODUCTS.find((p) => p.id === productGid);
}

export function findMockCatalogVariant(variantGid: string): MockCatalogVariant | undefined {
  for (const product of MOCK_CATALOG_PRODUCTS) {
    const variant = product.variants.find((v) => v.id === variantGid);
    if (variant) return variant;
  }
  return undefined;
}

export const MOCK_CATALOG_PRODUCTS: MockCatalogProduct[] = [
  {
    id: "gid://shopify/Product/1001",
    title: "Classic Crew Tee",
    status: "ACTIVE",
    productType: "Apparel",
    vendor: "Ethos Preview",
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png",
    variantCount: 3,
    totalInventory: 42,
    priceFrom: "24.00",
    submissionStatus: "not_submitted",
    variants: [
      {
        id: "gid://shopify/ProductVariant/2001",
        title: "Black / S",
        sku: "TEE-BLK-S",
        price: "24.00",
        unitCost: "8.50",
        inventory: 12,
      },
      {
        id: "gid://shopify/ProductVariant/2002",
        title: "Black / M",
        sku: "TEE-BLK-M",
        price: "24.00",
        unitCost: "8.50",
        inventory: 18,
      },
      {
        id: "gid://shopify/ProductVariant/2003",
        title: "White / M",
        sku: "TEE-WHT-M",
        price: "24.00",
        unitCost: "8.50",
        inventory: 12,
      },
    ],
  },
  {
    id: "gid://shopify/Product/1002",
    title: "Performance Hoodie",
    status: "ACTIVE",
    productType: "Apparel",
    vendor: "Ethos Preview",
    imageUrl: "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png",
    variantCount: 2,
    totalInventory: 15,
    priceFrom: "58.00",
    submissionStatus: "submitted",
    variants: [
      {
        id: "gid://shopify/ProductVariant/2004",
        title: "Navy / L",
        sku: "HD-NVY-L",
        price: "58.00",
        unitCost: "26.00",
        inventory: 8,
      },
      {
        id: "gid://shopify/ProductVariant/2005",
        title: "Navy / XL",
        sku: "HD-NVY-XL",
        price: "58.00",
        unitCost: "27.50",
        inventory: 7,
      },
    ],
  },
];
