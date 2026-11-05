import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { PLACEHOLDER_IMAGE } from "../lib/catalog-product";
import { SupplierApprovalBanner } from "../components/supplier-approval-banner";
import { resolveVendorAgreementState } from "../lib/vendor-agreement-preview-mock.server";
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
import {
  quantityTierStringsFromStorage,
  variantPricingCompleteForProduct,
} from "../lib/quantity-pricing";
import { getShopQuantityBreakTiers } from "../lib/shop-quantity-tiers.server";
import {
  customizationTypeLabelsFromIds,
  hasRequiredCustomizationTypes,
  parseCustomizationTypeIds,
} from "../lib/product-customization-types";
import {
  ConfigOptionTag,
  ConfigStatusRow,
} from "../components/embedded/config-check-item";

const SUBMISSION_STEPS = [
  "Configure pricing per variant. Set your own pricing and tiers.",
  "Choose optional customization options for the products.",
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
  const quantityBreakTiers = await getShopQuantityBreakTiers(ctx.shopDomain);

  const rows = selections.map((sel) => {
    const mock = mockById.get(sel.shopifyProductGid);
    const live = liveSummaries.get(sel.shopifyProductGid);
    const variants = sel.variantSelections;
    const pricedCount = variants.filter((v) => {
      const tiers = quantityTierStringsFromStorage(
        v.ethosQuantityPricing,
        v.ethosPrice?.toString(),
        quantityBreakTiers,
      );
      return variantPricingCompleteForProduct(
        tiers,
        sel.offerQuantityDiscounts,
        quantityBreakTiers,
      );
    }).length;
    const pricingComplete = variants.length > 0 && pricedCount === variants.length;
    const customizationTypeIds = parseCustomizationTypeIds(sel.customizationTypeIds);
    const customizationTypesComplete = hasRequiredCustomizationTypes(
      sel.offerCustomization,
      customizationTypeIds,
    );
    const designComplete =
      customizationTypesComplete &&
      (!sel.offerCustomization || sel.attachments.length > 0);
    const readyForSubmit =
      pricingComplete && designComplete && !importedByGid.has(sel.shopifyProductGid);
    return {
      shopifyProductGid: sel.shopifyProductGid,
      title: live?.title ?? mock?.title ?? sel.shopifyProductGid,
      imageUrl: live?.imageUrl ?? mock?.imageUrl ?? null,
      variantCount: variants.length,
      offerCustomization: sel.offerCustomization,
      customizationTypeCount: customizationTypeIds.length,
      customizationTypeLabels: customizationTypeLabelsFromIds(customizationTypeIds),
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

  const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
  const { agreement: vendorAgreement, vendorAgreementComplete: vendorAgreementReady } =
    resolveVendorAgreementState(request, shop, ctx.mode === "preview");

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
    vendorAgreement,
    vendorAgreementReady,
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

  const result = await submitSelectedProducts(ctx, request);
  return result;
};

function productNeedsConfiguring(row: {
  readyForSubmit: boolean;
  variantCount: number;
  pricedCount: number;
  attachmentCount: number;
  customizationTypeCount: number;
  offerCustomization: boolean;
}): boolean {
  if (row.readyForSubmit) return false;
  if (row.variantCount === 0 || row.pricedCount < row.variantCount) return true;
  if (row.offerCustomization && row.customizationTypeCount === 0) return true;
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
    customizationTypeCount: number;
    customizationTypeLabels: string[];
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

type SelectedListTab = "to_be_submitted" | "submitted";

function isSubmittedRow(row: RowForStatus): boolean {
  return (
    Boolean(row.importedItemCode) ||
    row.submissionStatus === "imported" ||
    row.submissionStatus === "submitted"
  );
}

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

function ProductConfigurationSummary({ row }: { row: RowForStatus }) {
  const pricingSet =
    row.variantCount > 0 && row.pricedCount === row.variantCount;
  const filesComplete = row.attachmentCount > 0;
  const typesComplete =
    !row.offerCustomization || row.customizationTypeCount > 0;
  const pricingDetail =
    row.variantCount > 0
      ? pricingSet
        ? `${row.variantCount} variant${row.variantCount === 1 ? "" : "s"}`
        : `${row.pricedCount}/${row.variantCount} priced`
      : "No variants";

  return (
    <div className={styles.productConfigCard} aria-label="Configuration progress">
      <ConfigStatusRow done={pricingSet} label="Pricing" detail={pricingDetail} />
      {row.offerCustomization ? (
        <ConfigStatusRow
          done={typesComplete && filesComplete}
          label="Customization"
          detail={
            filesComplete
              ? `${row.attachmentCount} file${row.attachmentCount === 1 ? "" : "s"}`
              : undefined
          }
        >
          <div className={styles.customizationOptionTags}>
            {row.customizationTypeLabels.length > 0 ? (
              row.customizationTypeLabels.map((label) => (
                <ConfigOptionTag key={label} tone="done">
                  {label}
                </ConfigOptionTag>
              ))
            ) : (
              <ConfigOptionTag tone="pending">No Types Selected</ConfigOptionTag>
            )}
            {!filesComplete ? (
              <ConfigOptionTag tone="pending">Design File Needed</ConfigOptionTag>
            ) : null}
          </div>
        </ConfigStatusRow>
      ) : (
        <ConfigStatusRow done label="Customization" detail="Not offered" />
      )}
    </div>
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

function SelectedListTabs({
  activeTab,
  onTabChange,
  toBeSubmittedCount,
  submittedCount,
}: {
  activeTab: SelectedListTab;
  onTabChange: (tab: SelectedListTab) => void;
  toBeSubmittedCount: number;
  submittedCount: number;
}) {
  return (
    <div className={styles.selectedListTabs} role="tablist" aria-label="Selected products">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "to_be_submitted"}
        className={`${styles.selectedListTab} ${
          activeTab === "to_be_submitted" ? styles.selectedListTabActive : ""
        }`}
        onClick={() => onTabChange("to_be_submitted")}
      >
        To Be Submitted ({toBeSubmittedCount})
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === "submitted"}
        className={`${styles.selectedListTab} ${
          activeTab === "submitted" ? styles.selectedListTabActive : ""
        }`}
        onClick={() => onTabChange("submitted")}
      >
        Submitted ({submittedCount})
      </button>
    </div>
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
      needs_attention: 0,
      ready_to_submit: 0,
      needs_configuring: 0,
    };
    for (const row of rows) {
      const kind = rowStatusTagKind(row);
      if (kind === "submitted") continue;
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
        {rows.length} in queue
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
  const {
    rows,
    count,
    supplier,
    vendorAgreement,
    vendorAgreementReady,
    readyCount,
    allSubmittedOrImported,
  } = useLoaderData<typeof loader>();
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
  const [listTab, setListTab] = useState<SelectedListTab>("to_be_submitted");
  const [statusFilter, setStatusFilter] = useState<RowStatusFilter | null>(null);

  useEffect(() => {
    if (!actionData || !(actionData.ok || actionData.imported > 0)) return;
    queueMicrotask(() => {
      setListTab("submitted");
      setStatusFilter(null);
    });
  }, [actionData]);

  const submittedRows = useMemo(() => rows.filter(isSubmittedRow), [rows]);
  const toBeSubmittedRows = useMemo(() => rows.filter((row) => !isSubmittedRow(row)), [rows]);

  const tabRows = listTab === "submitted" ? submittedRows : toBeSubmittedRows;

  const filteredRows = useMemo(() => {
    if (!statusFilter || listTab === "submitted") return tabRows;
    return tabRows.filter((row) => rowStatusTagKind(row) === statusFilter);
  }, [tabRows, statusFilter, listTab]);

  const handleListTabChange = (tab: SelectedListTab) => {
    setListTab(tab);
    setStatusFilter(null);
  };

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
            <SelectedListTabs
              activeTab={listTab}
              onTabChange={handleListTabChange}
              toBeSubmittedCount={toBeSubmittedRows.length}
              submittedCount={submittedRows.length}
            />
            {listTab === "to_be_submitted" ? (
              <SelectedSummaryBadges
                rows={toBeSubmittedRows}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
            ) : (
              <p className={styles.productMeta}>
                {submittedRows.length} product(s) sent to Ethos. Configure and submit new items
                under To Be Submitted.
              </p>
            )}
            {filteredRows.length === 0 ? (
              <p className={styles.productMeta}>
                {listTab === "submitted"
                  ? "Nothing submitted yet."
                  : "No products match this filter."}
              </p>
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
            {listTab === "to_be_submitted" ? (
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
                      !supplier.canSubmit ||
                      !vendorAgreementReady ||
                      readyCount === 0 ||
                      submitting ||
                      showSubmittedButton
                    }
                  >
                    {submitLabel}
                  </button>
                </Form>
              </div>
            ) : null}
          </>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
