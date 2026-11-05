import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { EmbeddedAppErrorBoundary } from "../components/embedded-app-error-boundary";
import { EmbeddedNavigationFix } from "../components/embedded-navigation-fix";
import { VendorAgreementBanner } from "../components/vendor-agreement-banner";
import { isLocalPreviewEnabled } from "../config/env.server";
import prisma from "../db.server";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { resolveVendorAgreementState } from "../lib/vendor-agreement-preview-mock.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
  const previewMode = ctx.mode === "preview";
  const { agreement: vendorAgreement, vendorAgreementComplete } =
    resolveVendorAgreementState(request, shop, previewMode);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    preview: isLocalPreviewEnabled(),
    vendorAgreement,
    vendorAgreementComplete,
  };
};

export default function App() {
  const { apiKey, preview, vendorAgreement, vendorAgreementComplete } =
    useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <EmbeddedNavigationFix />
      {preview ? (
        <div
          style={{
            background: "#fff7ed",
            borderBottom: "1px solid #fed7aa",
            color: "#9a3412",
            fontSize: "13px",
            padding: "8px 16px",
            textAlign: "center",
          }}
        >
          Local preview — mock catalog data. Shopify authentication is bypassed in development only.
        </div>
      ) : null}
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/selected">Selected</s-link>
        <s-link href="/app/submissions">Submissions</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/contact">Contact</s-link>
      </s-app-nav>
      {!vendorAgreementComplete ? (
        <div style={{ padding: "0 16px 8px" }}>
          <VendorAgreementBanner agreement={vendorAgreement} context="app" />
        </div>
      ) : null}
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return <EmbeddedAppErrorBoundary heading="App error" />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
