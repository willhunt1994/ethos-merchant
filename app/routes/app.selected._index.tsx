import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { PLACEHOLDER_IMAGE } from "../lib/catalog-product";
import { SupplierApprovalBanner } from "../components/supplier-approval-banner";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { getShopSupplierLinkView } from "../lib/shop-supplier.server";
import { MOCK_CATALOG_PRODUCTS } from "../lib/mock-catalog";
import { fetchProductSummariesByGids } from "../lib/shopify/products.server";
import { submitSelectedProducts, type SubmitSelectionResult } from "../lib/submission.server";

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

  const rows = selections.map((sel) => {
    const mock = mockById.get(sel.shopifyProductGid);
    const live = liveSummaries.get(sel.shopifyProductGid);
    const variants = sel.variantSelections;
    const pricedCount = variants.filter((v) => v.ethosPrice != null && Number(v.ethosPrice) > 0).length;
    const readyForSubmit =
      variants.length > 0 &&
      pricedCount === variants.length &&
      !importedByGid.has(sel.shopifyProductGid);
    return {
      shopifyProductGid: sel.shopifyProductGid,
      title: live?.title ?? mock?.title ?? sel.shopifyProductGid,
      imageUrl: live?.imageUrl ?? mock?.imageUrl ?? null,
      variantCount: variants.length,
      attachmentCount: sel.attachments.length,
      pricedCount,
      readyForSubmit,
      importedItemCode: importedByGid.get(sel.shopifyProductGid) ?? null,
    };
  });

  const supplier = await getShopSupplierLinkView(ctx.shopDomain, {
    previewMode: ctx.mode === "preview",
  });

  const readyCount = rows.filter((r) => r.readyForSubmit).length;

  return { rows, mode: ctx.mode, count: rows.length, supplier, readyCount };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const form = await request.formData();
  if (String(form.get("intent") ?? "") !== "submit-all") {
    return Response.json({ ok: false, error: "Unknown intent" }, { status: 400 });
  }

  const result = await submitSelectedProducts(ctx);
  return Response.json(result);
};

export default function SelectedProductsPage() {
  const { rows, count, supplier, readyCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<SubmitSelectionResult>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <s-page heading="Selected products">
      <SupplierApprovalBanner supplier={supplier} />
      {actionData ? (
        <s-section>
          <p style={{ fontSize: "14px", margin: 0 }}>
            {actionData.imported > 0 ? (
              <span style={{ color: "#15803d" }}>
                Imported {actionData.imported} product(s).
                {actionData.skipped > 0 ? ` Skipped ${actionData.skipped} already imported.` : ""}
              </span>
            ) : null}
            {actionData.failed > 0 ? (
              <span style={{ color: "#b91c1c", display: "block", marginTop: "4px" }}>
                {actionData.failed} failed.{" "}
                {actionData.errors?.length ? actionData.errors.join(" · ") : ""}
              </span>
            ) : null}
            {!actionData.ok && actionData.imported === 0 && actionData.errors?.length ? (
              <span style={{ color: "#b91c1c" }}>{actionData.errors.join(" · ")}</span>
            ) : null}
          </p>
          {actionData.submissionId ? (
            <s-link href="/app/submissions">
              View submission details
            </s-link>
          ) : null}
        </s-section>
      ) : null}
      <s-section heading="Configure before submission">
        {count === 0 ? (
          <s-paragraph>
            No products selected yet.{" "}
            <s-link href="/app/products">
              Browse products
            </s-link>
            .
          </s-paragraph>
        ) : (
          <>
            <s-paragraph>
              {count} product(s) in your selection. {readyCount} ready to submit (pricing set on all selected
              variants).
            </s-paragraph>
            <Form method="post" style={{ marginBottom: "16px" }}>
              <input type="hidden" name="intent" value="submit-all" />
              <button
                type="submit"
                disabled={!supplier.canSubmit || readyCount === 0 || submitting}
                title={
                  !supplier.canSubmit
                    ? "Supplier must be approved"
                    : readyCount === 0
                      ? "Configure Ethos pricing on each product first"
                      : undefined
                }
              >
                {submitting ? "Submitting…" : "Submit to Ethos"}
              </button>
            </Form>
            <ul style={{ listStyle: "none", padding: 0, margin: "16px 0" }}>
              {rows.map((row) => (
                <li
                  key={row.shopifyProductGid}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: "1px solid #f4f4f5",
                  }}
                >
                  <img
                    src={row.imageUrl ?? PLACEHOLDER_IMAGE}
                    alt=""
                    width={48}
                    height={48}
                    style={{ borderRadius: "8px", objectFit: "cover" }}
                  />
                  <div style={{ flex: 1 }}>
                    <strong>{row.title}</strong>
                    <div style={{ fontSize: "12px", color: "#71717a" }}>
                      {row.variantCount} variant(s) · {row.pricedCount}/{row.variantCount} priced ·{" "}
                      {row.attachmentCount} attachment(s)
                      {row.importedItemCode ? (
                        <span style={{ color: "#15803d" }}> · Imported ({row.importedItemCode})</span>
                      ) : row.readyForSubmit ? (
                        <span style={{ color: "#15803d" }}> · Ready</span>
                      ) : (
                        <span style={{ color: "#a16207" }}> · Needs pricing</span>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/app/selected/configure?productGid=${encodeURIComponent(row.shopifyProductGid)}`}
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#2c6ecb",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Configure
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </s-section>
      <s-section slot="aside" heading="Submission">
        <s-unordered-list>
          <s-list-item>Set Ethos price on every selected variant</s-list-item>
          <s-list-item>Upload design files (recommended)</s-list-item>
          <s-list-item>Submit creates catalog items under your linked supplier</s-list-item>
        </s-unordered-list>
        <s-link href="/app/products">
          <s-button variant="tertiary">Back to products</s-button>
        </s-link>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
