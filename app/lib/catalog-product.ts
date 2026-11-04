import type { SubmissionDisplayStatus } from "./product-selection.server";

export type CatalogProduct = {
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
  submissionStatus: SubmissionDisplayStatus;
  selected: boolean;
};

export const PLACEHOLDER_IMAGE =
  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_large.png";
