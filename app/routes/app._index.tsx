import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Link, useLoaderData } from "react-router";
import { SupplierApprovalBanner } from "../components/supplier-approval-banner";
import styles from "../styles/embedded-app.module.css";
import { loadAppDashboard } from "../lib/dashboard.server";
import { requireMerchantContext } from "../lib/merchant-auth.server";

const WORKFLOW_STEPS = [
  "Choose Products",
  "Upload Designs",
  "Set Pricing",
  "Submit to Ethos",
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const dashboard = await loadAppDashboard(ctx.shopDomain, ctx.mode === "preview");
  return { shopDomain: ctx.shopDomain, mode: ctx.mode, ...dashboard };
};

function approvalBadgeTone(
  status: string,
): "success" | "warning" | "critical" | "neutral" {
  if (status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected") return "critical";
  return "neutral";
}

export default function AppHome() {
  const {
    shopDomain,
    supplier,
    selectedCount,
    readyToSubmit,
    needsPricing,
    lastSubmission,
  } = useLoaderData<typeof loader>();

  const primaryHref =
    selectedCount === 0
      ? "/app/products"
      : readyToSubmit > 0 && supplier.canSubmit
        ? "/app/selected"
        : "/app/selected";

  const primaryLabel =
    selectedCount === 0
      ? "Choose Products"
      : readyToSubmit > 0 && supplier.canSubmit
        ? "Submit to Ethos"
        : "Configure Selection";

  return (
    <s-page heading="Ethos Merch">
      <SupplierApprovalBanner supplier={supplier} />

      <s-section>
        <h2 className={styles.sectionTitle}>Overview</h2>
        <div className={styles.workflowSteps} aria-label="How it works">
          {WORKFLOW_STEPS.map((label, index) => {
            const isChooseStep = index === 0 && selectedCount === 0;
            if (isChooseStep) {
              return (
                <Link
                  key={label}
                  to="/app/products"
                  className={`${styles.workflowStep} ${styles.workflowStepChoose}`}
                >
                  <span className={styles.workflowStepNumber} aria-hidden>
                    {index + 1}
                  </span>
                  <span className={styles.workflowStepLabel}>{label}</span>
                </Link>
              );
            }

            return (
              <div key={label} className={styles.workflowStep}>
                <span className={styles.workflowStepNumber} aria-hidden>
                  {index + 1}
                </span>
                <span className={styles.workflowStepLabel}>{label}</span>
              </div>
            );
          })}
        </div>
        {selectedCount > 0 || needsPricing > 0 ? (
          <s-stack direction="inline" gap="base">
            {selectedCount > 0 ? (
              <s-link href={primaryHref}>
                <s-button variant="primary">{primaryLabel}</s-button>
              </s-link>
            ) : null}
            {needsPricing > 0 ? (
              <s-link href="/app/selected">
                <s-button variant="tertiary">
                  {needsPricing} Need Pricing
                </s-button>
              </s-link>
            ) : null}
          </s-stack>
        ) : null}
      </s-section>

      <s-section>
        <h2 className={styles.sectionTitleStore}>Your Store</h2>
        <div className={styles.storePanel}>
          <div className={styles.storeDomainRow}>
            <span className={styles.storeDomain}>{shopDomain}</span>
            <s-badge tone={approvalBadgeTone(supplier.approvalStatus)}>
              {supplier.approvalStatus === "approved"
                ? "Approved"
                : supplier.approvalStatus === "pending"
                  ? "Pending Approval"
                  : supplier.approvalStatus === "rejected"
                    ? "Not Approved"
                    : "Not Linked"}
            </s-badge>
          </div>
          {supplier.ethosSupplierSlug ? (
            <p className={styles.storeMeta}>
              Supplier: <strong>{supplier.ethosSupplierSlug}</strong>
            </p>
          ) : null}
          {lastSubmission ? (
            <p className={styles.storeMeta}>
              Last Submission: {lastSubmission.status} ·{" "}
              {new Date(lastSubmission.createdAt).toLocaleDateString()}
            </p>
          ) : null}
          <Link to="/app/settings" className={styles.settingsButton}>
            Settings
          </Link>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
