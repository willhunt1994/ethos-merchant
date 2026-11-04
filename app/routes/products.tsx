import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

/** Shopify Admin app paths omit the `/app` prefix (e.g. …/apps/ethosmerchant/products). */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app/products${url.search}`);
};

export default function ProductsRedirect() {
  return null;
}
