import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { SupplierApprovalBanner } from "../components/supplier-approval-banner";
import styles from "../styles/embedded-app.module.css";
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
      return "Pending Approval";
    case "rejected":
      return "Not Approved";
    default:
      return "Not Linked";
  }
}

function approvalTagClass(status: string): string {
  switch (status) {
    case "approved":
      return styles.attachmentStatusTagSuccess;
    case "pending":
      return styles.attachmentStatusTagWarning;
    case "rejected":
      return styles.attachmentStatusTagDanger;
    default:
      return styles.attachmentStatusTagNeutral;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function SettingsPage() {
  const { mode, shopDomain, installedAt, lastSyncAt, supplier } = useLoaderData<typeof loader>();

  const supplierHelpText =
    supplier.approvalStatus === "pending"
      ? "You can browse, select, and upload design files while approval is pending. Submission stays disabled until Ethos approves the link."
      : supplier.approvalStatus === "rejected"
        ? "Contact your Ethos representative to review the supplier link for this store."
        : supplier.ethosSupplierSlug
          ? null
          : "Contact your Ethos representative to request a supplier link for this store.";

  return (
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>Settings</h1>
        <Link to="/app" className={styles.settingsButton}>
          Back to Dashboard
        </Link>
      </div>

      <SupplierApprovalBanner supplier={supplier} />

      <s-section>
        <div className={styles.settingsStack}>
          <section className={styles.settingsPanel} aria-labelledby="settings-shopify-heading">
            <h2 id="settings-shopify-heading" className={styles.settingsPanelTitle}>
              Shopify Connection
            </h2>
            <ul className={styles.settingsDetailList}>
              <li className={styles.settingsDetailRow}>
                <span className={styles.settingsDetailKey}>Store</span>
                <span className={styles.settingsDetailValue}>
                  {shopDomain}
                  {mode === "preview" ? (
                    <span className={styles.productMeta}> · Local preview</span>
                  ) : null}
                </span>
              </li>
              <li className={styles.settingsDetailRow}>
                <span className={styles.settingsDetailKey}>Installed</span>
                <span className={styles.settingsDetailValue}>{formatDateTime(installedAt)}</span>
              </li>
              <li className={styles.settingsDetailRow}>
                <span className={styles.settingsDetailKey}>Last Sync</span>
                <span className={styles.settingsDetailValue}>{formatDateTime(lastSyncAt)}</span>
              </li>
            </ul>
          </section>

          <section className={styles.settingsPanel} aria-labelledby="settings-supplier-heading">
            <h2 id="settings-supplier-heading" className={styles.settingsPanelTitle}>
              Ethos Supplier
            </h2>
            {supplier.ethosSupplierSlug ? (
              <ul className={styles.settingsDetailList}>
                <li className={styles.settingsDetailRow}>
                  <span className={styles.settingsDetailKey}>Supplier Slug</span>
                  <span className={styles.settingsDetailValue}>
                    {supplier.ethosSupplierSlug}
                    {supplier.ethosSupplierId ? (
                      <span className={styles.productMeta}> · ID {supplier.ethosSupplierId}</span>
                    ) : null}
                  </span>
                </li>
                <li className={styles.settingsDetailRow}>
                  <span className={styles.settingsDetailKey}>Status</span>
                  <span className={approvalTagClass(supplier.approvalStatus)}>
                    {approvalLabel(supplier.approvalStatus)}
                  </span>
                </li>
                <li className={styles.settingsDetailRow}>
                  <span className={styles.settingsDetailKey}>Approved</span>
                  <span className={styles.settingsDetailValue}>
                    {formatDateTime(supplier.approvedAt)}
                  </span>
                </li>
              </ul>
            ) : (
              <p className={styles.settingsHelpText}>
                No supplier is linked to this store yet. Ethos links your Shopify shop to your custom
                supplier record—you cannot submit products until that link is approved.
              </p>
            )}
            {supplierHelpText ? (
              <p className={styles.settingsHelpText}>{supplierHelpText}</p>
            ) : null}
          </section>

          <section className={styles.settingsPanel} aria-labelledby="settings-support-heading">
            <h2 id="settings-support-heading" className={styles.settingsPanelTitle}>
              Support
            </h2>
            <p className={styles.settingsHelpText}>
              Contact your Ethos representative for supplier linking or integration issues.
            </p>
            <div className={styles.settingsActions}>
              <Link to="/app/contact" className={styles.settingsButton}>
                Contact
              </Link>
              <Link to="/app/selected" className={styles.settingsButton}>
                View Selected Products
              </Link>
            </div>
          </section>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
