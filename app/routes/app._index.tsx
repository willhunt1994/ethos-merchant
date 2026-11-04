import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { requireMerchantContext } from "../lib/merchant-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  return { shopDomain: ctx.shopDomain, mode: ctx.mode };
};

export default function AppHome() {
  return (
    <s-page heading="Ethos merchant">
      <s-section heading="Product integration">
        <s-paragraph>
          Browse your Shopify catalog, configure Ethos pricing and documentation, and submit products to
          the Ethos Employee platform under your approved supplier.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-link href="/app/products">
            <s-button variant="primary">Browse products</s-button>
          </s-link>
          <s-link href="/app/selected">
            <s-button>Review selection</s-button>
          </s-link>
        </s-stack>
      </s-section>
      <s-section slot="aside" heading="Workflow">
        <s-unordered-list>
          <s-list-item>Connect store (Shopify OAuth)</s-list-item>
          <s-list-item>Wait for Ethos supplier approval</s-list-item>
          <s-list-item>Select products and set Ethos prices</s-list-item>
          <s-list-item>Upload design files and submit</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
