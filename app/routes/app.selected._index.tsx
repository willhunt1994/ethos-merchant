import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { useMemo, useState, type ReactNode } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { PLACEHOLDER_IMAGE } from "../lib/catalog-product";
import { SupplierApprovalBanner } from "../components/supplier-approval-banner";
import styles from "../styles/embedded-app.module.css";
import { EmptyState } from "../components/embedded/empty-state";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { getShopSupplierLinkView } from "../lib/shop-supplier.server";
import { MOCK_CATALOG_PRODUCTS } from "../lib/mock-catalog";
import { fetchProductSummariesByGids } from "../lib/shopify/products.server";
import {
  getSubmissionStatusByProductGid,
  type SubmissionDisplayStatus,
} from "../lib/product-selection.server";
import { submitSelectedProducts, type SubmitSelectionResult } from "../lib/submission.server";

const SUBMISSION_STEPS = [
  "Set Ethos price on every selected variant",
  "Upload design files",
  "Submit items to the Ethos catalog when complete.",
] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);

  const selections = await prisma.productSelection.findMany({
    where: { shopDomain: ctx.shopDomain },
    include: {
      variantSelections: { where: { selected: true } },
      attachments: { where: { status: "uploaded" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const gids = selections.map((s) => s.shopifyProductGid);
  const mockById = new Map(MOCK_CATALOG_PRODUCTS.map((p) => [p.id, p]));
  const liveSummaries =
    ctx.mode === "shopify" && ctx.admin ? await fetchProductSummariesByGids(ctx.admin, gids) : new Map();

  const importedMaps = await prisma.shopifyProductMap.findMany({
    where: { shopDomain: ctx.shopDomain, shopifyProductGid: { in: gids } },
    select: { shopifyProductGid: true, itemCode: true },
  });
  const importedByGid = new Map(importedMaps.map((m) => [m.shopifyProductGid, m.itemCode]));
  const submissionStatusByGid = await getSubmissionStatusByProductGid(ctx.shopDomain, gids);

  const rows = selections.map((sel) => {
    const mock = mockById.get(sel.shopifyProductGid);
    const live = liveSummaries.get(sel.shopifyProductGid);
    const variants = sel.variantSelections;
    const pricedCount = variants.filter((v) => v.ethosPrice != null && Number(v.ethosPrice) > 0).length;
    const pricingComplete = variants.length > 0 && pricedCount === variants.length;
    const designComplete = !sel.offerCustomization || sel.attachments.length > 0;
    const readyForSubmit =
      pricingComplete && designComplete && !importedByGid.has(sel.shopifyProductGid);
    return {
      shopifyProductGid: sel.shopifyProductGid,
      title: live?.title ?? mock?.title ?? sel.shopifyProductGid,
      imageUrl: live?.imageUrl ?? mock?.imageUrl ?? null,
      variantCount: variants.length,
      offerCustomization: sel.offerCustomization,
      attachmentCount: sel.attachments.length,
      pricedCount,
      readyForSubmit,
      importedItemCode: importedByGid.get(sel.shopifyProductGid) ?? null,
      submissionStatus:
        submissionStatusByGid.get(sel.shopifyProductGid) ?? ("not_submitted" as SubmissionDisplayStatus),
    };
  });

  const supplier = await getShopSupplierLinkView(ctx.shopDomain, {
    previewMode: ctx.mode === "preview",
  });

  const readyCount = rows.filter((r) => r.readyForSubmit).length;
  const allSubmittedOrImported =
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.importedItemCode != null ||
        r.submissionStatus === "imported" ||
        r.submissionStatus === "submitted",
    );

  return {
    rows,
    mode: ctx.mode,
    count: rows.length,
    supplier,
    readyCount,
    allSubmittedOrImported,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const form = await request.formData();
  if (String(form.get("intent") ?? "") !== "submit-all") {
    return Response.json({ ok: false, error: "Unknown intent" }, { status: 400 });
  }

  const result = await submitSelectedProducts(ctx);
  return result;
};

function productNeedsConfiguring(row: {
  readyForSubmit: boolean;
  variantCount: number;
  pricedCount: number;
  attachmentCount: number;
  offerCustomization: boolean;
}): boolean {
  if (row.readyForSubmit) return false;
  if (row.variantCount === 0 || row.pricedCount < row.variantCount) return true;
  if (row.offerCustomization && row.attachmentCount === 0) return true;
  return false;
}

function RowStatusBadges({
  row,
}: {
  row: {
    importedItemCode: string | null;
    readyForSubmit: boolean;
    variantCount: number;
    pricedCount: number;
    attachmentCount: number;
    offerCustomization: boolean;
    submissionStatus: SubmissionDisplayStatus;
  };
}) {
  if (
    row.importedItemCode ||
    row.submissionStatus === "imported" ||
    row.submissionStatus === "submitted"
  ) {
    return <span className={styles.attachmentStatusTagSuccess}>Submitted</span>;
  }

  if (row.submissionStatus === "needs_attention") {
    return <span className={styles.attachmentStatusTagWarning}>Needs Attention</span>;
  }

  if (row.readyForSubmit) {
    return <span className={styles.attachmentStatusTagSuccess}>Ready To Submit</span>;
  }

  if (productNeedsConfiguring(row)) {
    return (
      <span className={styles.attachmentStatusTagWarning}>Needs Configuring</span>
    );
  }

  return null;
}

type RowForStatus = Parameters<typeof RowStatusBadges>[0]["row"];

type RowStatusFilter =
  | "submitted"
  | "needs_attention"
  | "ready_to_submit"
  | "needs_configuring";

function rowStatusTagKind(
  row: RowForStatus,
): RowStatusFilter | null {
  if (
    row.importedItemCode ||
    row.submissionStatus === "imported" ||
    row.submissionStatus === "submitted"
  ) {
    return "submitted";
  }
  if (row.submissionStatus === "needs_attention") return "needs_attention";
  if (row.readyForSubmit) return "ready_to_submit";
  if (productNeedsConfiguring(row)) return "needs_configuring";
  return null;
}

function ConfigCheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={styles.configCheckRow}>
      <span className={styles.configCheckLabel}>
        <span
          className={done ? styles.configCheckBoxDone : styles.configCheckBoxPending}
          aria-hidden
        >
          {done ? "✓" : ""}
        </span>
        {label}
      </span>
    </li>
  );
}

function ProductConfigurationSummary({ row }: { row: RowForStatus }) {
  const pricingSet =
    row.variantCount > 0 && row.pricedCount === row.variantCount;
  const filesComplete = row.attachmentCount > 0;

  return (
    <ul className={styles.productConfigList}>
      <ConfigCheckItem done={pricingSet} label="Pricing Set" />
      <ConfigCheckItem done={row.offerCustomization} label="Offer Customization" />
      <ConfigCheckItem done={filesComplete} label="Design Files Uploaded" />
    </ul>
  );
}

function SummaryFilterPill({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.summaryFilterTag} ${className} ${
        active ? styles.summaryFilterTagActive : ""
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SelectedSummaryBadges({
  rows,
  statusFilter,
  onStatusFilterChange,
}: {
  rows: RowForStatus[];
  statusFilter: RowStatusFilter | null;
  onStatusFilterChange: (next: RowStatusFilter | null) => void;
}) {
  const counts = useMemo(() => {
    const tally = {
      submitted: 0,
      needs_attention: 0,
      ready_to_submit: 0,
      needs_configuring: 0,
    };
    for (const row of rows) {
      const kind = rowStatusTagKind(row);
      if (kind) tally[kind] += 1;
    }
    return tally;
  }, [rows]);

  const toggle = (kind: RowStatusFilter) => {
    onStatusFilterChange(statusFilter === kind ? null : kind);
  };

  return (
    <div className={styles.selectedSummaryRow}>
      <span className={styles.selectedSummaryCount}>
        {rows.length} product(s) selected
        {statusFilter ? " · filtered" : ""}
      </span>
      {counts.ready_to_submit > 0 ? (
        <SummaryFilterPill
          active={statusFilter === "ready_to_submit"}
          onClick={() => toggle("ready_to_submit")}
          className={styles.attachmentStatusTagSuccess}
        >
          Ready To Submit
          {counts.ready_to_submit > 1 ? ` (${counts.ready_to_submit})` : ""}
        </SummaryFilterPill>
      ) : null}
      {counts.submitted > 0 ? (
        <SummaryFilterPill
          active={statusFilter === "submitted"}
          onClick={() => toggle("submitted")}
          className={styles.attachmentStatusTagSuccess}
        >
          Submitted
          {counts.submitted > 1 ? ` (${counts.submitted})` : ""}
        </SummaryFilterPill>
      ) : null}
      {counts.needs_configuring > 0 ? (
        <SummaryFilterPill
          active={statusFilter === "needs_configuring"}
          onClick={() => toggle("needs_configuring")}
          className={styles.attachmentStatusTagWarning}
        >
          Needs Configuring
          {counts.needs_configuring > 1 ? ` (${counts.needs_configuring})` : ""}
        </SummaryFilterPill>
      ) : null}
      {counts.needs_attention > 0 ? (
        <SummaryFilterPill
          active={statusFilter === "needs_attention"}
          onClick={() => toggle("needs_attention")}
          className={styles.attachmentStatusTagWarning}
        >
          Needs Attention
          {counts.needs_attention > 1 ? ` (${counts.needs_attention})` : ""}
        </SummaryFilterPill>
      ) : null}
    </div>
  );
}

function submitButtonLabel(options: {
  submitting: boolean;
  readyCount: number;
  allSubmittedOrImported: boolean;
  justFinishedSubmit: boolean;
}): string {
  if (options.submitting) return "Submitting…";
  if (options.readyCount > 0) return "Submit";
  if (options.allSubmittedOrImported || options.justFinishedSubmit) return "Submitted";
  return "Submit";
}

export default function SelectedProductsPage() {
  const { rows, count, supplier, readyCount, allSubmittedOrImported } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<SubmitSelectionResult>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const justFinishedSubmit = Boolean(
    actionData && (actionData.ok || actionData.imported > 0) && readyCount === 0,
  );
  const submitLabel = submitButtonLabel({
    submitting,
    readyCount,
    allSubmittedOrImported,
    justFinishedSubmit,
  });
  const showSubmittedButton = submitLabel === "Submitted";
  const [statusFilter, setStatusFilter] = useState<RowStatusFilter | null>(null);
  const filteredRows = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((row) => rowStatusTagKind(row) === statusFilter);
  }, [rows, statusFilter]);

  return (
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>Selected Products</h1>
        <Link to="/app/products" className={styles.settingsButton}>
          Back to Products
        </Link>
      </div>
      <SupplierApprovalBanner supplier={supplier} />
      {actionData ? (
        <s-section>
          {actionData.ok || actionData.imported > 0 ? (
            <s-banner tone="success" heading="Submission complete">
              Imported {actionData.imported} product(s).
              {actionData.skipped > 0 ? ` Skipped ${actionData.skipped} already imported.` : ""}
              {actionData.submissionId ? (
                <>
                  {" "}
                  <s-link href="/app/submissions">View details</s-link>
                </>
              ) : null}
            </s-banner>
          ) : (
            <s-banner tone="critical" heading="Submission failed">
              {actionData.errors?.length ? actionData.errors.join(" · ") : "Could not submit selection."}
            </s-banner>
          )}
          {actionData.failed > 0 && actionData.imported > 0 ? (
            <s-banner tone="warning" heading="Some products failed">
              {actionData.failed} failed. {actionData.errors?.join(" · ")}
            </s-banner>
          ) : null}
        </s-section>
      ) : null}

      <s-section>
        <h2 className={styles.sectionTitle}>Configure Before Submission</h2>
        <div className={`${styles.workflowSteps} ${styles.workflowStepsThree}`} aria-label="Submission steps">
          {SUBMISSION_STEPS.map((label, index) => (
            <div key={label} className={styles.workflowStep}>
              <span className={styles.workflowStepNumber} aria-hidden>
                {index + 1}
              </span>
              <span className={styles.workflowStepLabel}>{label}</span>
            </div>
          ))}
        </div>
      </s-section>

      <s-section>
        {count === 0 ? (
          <EmptyState
            title="Nothing selected yet"
            description="Choose products from your catalog to configure Ethos pricing and design files."
            action={
              <s-link href="/app/products">
                <s-button variant="primary">Browse products</s-button>
              </s-link>
            }
          />
        ) : (
          <>
            <SelectedSummaryBadges
              rows={rows}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
            {filteredRows.length === 0 ? (
              <p className={styles.productMeta}>No products match this filter.</p>
            ) : null}
            <ul className={styles.rowList}>
              {filteredRows.map((row) => (
                <li key={row.shopifyProductGid} className={styles.rowItem}>
                  <img
                    src={row.imageUrl ?? PLACEHOLDER_IMAGE}
                    alt=""
                    className={styles.thumbRow}
                  />
                  <div className={styles.rowItemMain}>
                    <strong>{row.title}</strong>
                    <ProductConfigurationSummary row={row} />
                    <div className={styles.productBadgeRow}>
                      <RowStatusBadges row={row} />
                    </div>
                  </div>
                  <s-link
                    href={`/app/selected/configure?productGid=${encodeURIComponent(row.shopifyProductGid)}`}
                  >
                    <s-button variant="secondary">Configure</s-button>
                  </s-link>
                </li>
              ))}
            </ul>
            <div className={styles.selectedSubmitBar}>
              <Form method="post">
                <input type="hidden" name="intent" value="submit-all" />
                <button
                  type="submit"
                  className={
                    showSubmittedButton
                      ? `${styles.primarySubmitButton} ${styles.primarySubmitButtonSubmitted}`
                      : styles.primarySubmitButton
                  }
                  disabled={
                    !supplier.canSubmit || readyCount === 0 || submitting || showSubmittedButton
                  }
                >
                  {submitLabel}
                </button>
              </Form>
            </div>
          </>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
