import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CustomProductsPanel } from "../components/embedded/custom-products-panel";
import styles from "../styles/embedded-app.module.css";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { MOCK_CUSTOM_PRODUCTS } from "../lib/mock-custom-products";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  return {
    previewMode: ctx.mode === "preview",
    customProducts: MOCK_CUSTOM_PRODUCTS,
  };
};

export default function CustomProductsPage() {
  const { previewMode, customProducts } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>Custom Products</h1>
        <Link to="/app" className={styles.settingsButton}>
          Back to Dashboard
        </Link>
      </div>

      <CustomProductsPanel products={customProducts} previewMode={previewMode} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};