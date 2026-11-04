import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { getShopSupplierLinkView } from "../lib/shop-supplier.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
  const supplier = await getShopSupplierLinkView(ctx.shopDomain, {
    previewMode: ctx.mode === "preview",
  });

  return {
    mode: ctx.mode,
    shopDomain: ctx.shopDomain,
    installedAt: shop?.installedAt?.toISOString() ?? null,
    lastSyncAt: shop?.lastSyncAt?.toISOString() ?? null,
    supplier,
  };
};

function approvalLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "pending":
      return "Pending approval";
    case "rejected":
      return "Not approved";
    default:
      return "Not linked";
  }
}

export default function SettingsPage() {
  const { mode, shopDomain, installedAt, lastSyncAt, supplier } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings">
      <s-section heading="Shopify connection">
        <s-paragraph>
          Store: <strong>{shopDomain}</strong>
          {mode === "preview" ? " (local preview)" : ""}
        </s-paragraph>
        {installedAt ? (
          <s-paragraph>Installed: {new Date(installedAt).toLocaleString()}</s-paragraph>
        ) : null}
        {lastSyncAt ? (
          <s-paragraph>Last sync: {new Date(lastSyncAt).toLocaleString()}</s-paragraph>
        ) : (
          <s-paragraph>Last sync: —</s-paragraph>
        )}
      </s-section>

      <s-section heading="Ethos supplier">
        {supplier.ethosSupplierSlug ? (
          <>
            <s-paragraph>
              Supplier slug: <strong>{supplier.ethosSupplierSlug}</strong>
              {supplier.ethosSupplierId ? ` (id ${supplier.ethosSupplierId})` : ""}
            </s-paragraph>
            <s-paragraph>
              Status: <strong>{approvalLabel(supplier.approvalStatus)}</strong>
            </s-paragraph>
            {supplier.approvedAt ? (
              <s-paragraph>Approved: {new Date(supplier.approvedAt).toLocaleString()}</s-paragraph>
            ) : null}
          </>
        ) : (
          <s-paragraph>
            No supplier is linked to this store yet. Ethos links your Shopify shop to your custom supplier record—you
            cannot submit products until that link is approved.
          </s-paragraph>
        )}

        {supplier.canSubmit ? (
          <s-paragraph>You can submit products to Ethos once configuration and pricing are complete (Phase 6).</s-paragraph>
        ) : supplier.approvalStatus === "pending" ? (
          <s-paragraph>
            You can browse, select, and upload design files while approval is pending. Submission stays disabled until
            Ethos approves the link.
          </s-paragraph>
        ) : supplier.approvalStatus === "rejected" ? (
          <s-paragraph>Contact your Ethos representative to review the supplier link for this store.</s-paragraph>
        ) : (
          <s-paragraph>Contact your Ethos representative to request a supplier link for this store.</s-paragraph>
        )}
      </s-section>

      <s-section slot="aside" heading="Support">
        <s-paragraph>Contact your Ethos representative for supplier linking or integration issues.</s-paragraph>
        <Link to="/app/selected">View selected products</Link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
