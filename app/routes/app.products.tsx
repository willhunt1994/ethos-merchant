import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useSearchParams, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { EmbeddedAppErrorBoundary } from "../components/embedded-app-error-boundary";
import prisma from "../db.server";
import { PLACEHOLDER_IMAGE, type CatalogProduct } from "../lib/catalog-product";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { MOCK_CATALOG_PRODUCTS } from "../lib/mock-catalog";
import {
  countSelectedProducts,
  getSelectedProductGids,
  getSubmissionStatusByProductGid,
  setProductSelected,
} from "../lib/product-selection.server";
import { fetchProductVariantGids, fetchProductsPage } from "../lib/shopify/products.server";

const VIEW_COOKIE = "ethos_product_view";

function submissionLabel(status: CatalogProduct["submissionStatus"]): string {
  switch (status) {
    case "imported":
      return "Imported";
    case "submitted":
      return "Submitted";
    case "needs_attention":
      return "Needs attention";
    default:
      return "Not submitted";
  }
}

async function loadCatalogProducts(
  ctx: Awaited<ReturnType<typeof requireMerchantContext>>,
  params: {
    after: string | null;
    q: string;
    status: string;
    vendor: string;
    productType: string;
  },
): Promise<{ products: CatalogProduct[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }> {
  const selected = await getSelectedProductGids(ctx.shopDomain);

  if (ctx.mode === "preview") {
    const q = params.q.toLowerCase();
    const list = MOCK_CATALOG_PRODUCTS.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q) && !p.vendor.toLowerCase().includes(q)) return false;
      if (params.status && p.status !== params.status) return false;
      if (params.vendor && !p.vendor.toLowerCase().includes(params.vendor.toLowerCase())) return false;
      if (params.productType && !p.productType.toLowerCase().includes(params.productType.toLowerCase())) return false;
      return true;
    });
    const gids = list.map((p) => p.id);
    const statuses = await getSubmissionStatusByProductGid(ctx.shopDomain, gids);
    const products: CatalogProduct[] = list.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      productType: p.productType,
      vendor: p.vendor,
      imageUrl: p.imageUrl,
      variantCount: p.variantCount,
      totalInventory: p.totalInventory,
      priceFrom: p.priceFrom,
      currencyCode: "USD",
      primarySku: p.variants[0]?.sku ?? null,
      submissionStatus: statuses.get(p.id) ?? p.submissionStatus,
      selected: selected.has(p.id),
    }));
    return { products, pageInfo: { hasNextPage: false, endCursor: null } };
  }

  if (!ctx.admin) {
    return { products: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }

  const page = await fetchProductsPage(ctx.admin, {
    first: 24,
    after: params.after,
    q: params.q || undefined,
    status: params.status || undefined,
    vendor: params.vendor || undefined,
    productType: params.productType || undefined,
  });

  const gids = page.products.map((p) => p.id);
  const statuses = await getSubmissionStatusByProductGid(ctx.shopDomain, gids);

  const products: CatalogProduct[] = page.products.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    productType: p.productType,
    vendor: p.vendor,
    imageUrl: p.imageUrl,
    variantCount: p.variantCount,
    totalInventory: p.totalInventory,
    priceFrom: p.priceFrom,
    currencyCode: p.currencyCode,
    primarySku: p.primarySku,
    submissionStatus: statuses.get(p.id) ?? "not_submitted",
    selected: selected.has(p.id),
  }));

  return {
    products,
    pageInfo: { hasNextPage: page.pageInfo.hasNextPage, endCursor: page.pageInfo.endCursor },
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const url = new URL(request.url);
  const viewParam = url.searchParams.get("view");
  const cookieView = request.headers.get("Cookie")?.match(/ethos_product_view=(grid|list)/)?.[1];

  let preference;
  try {
    preference = await prisma.merchantUiPreference.findUnique({
      where: { shopDomain: ctx.shopDomain },
    });
  } catch (e) {
    console.error("[app.products] database error", e);
    throw new Response(
      "Database unreachable. Start the Postgres tunnel (pnpm db:tunnel) and restart pnpm dev.",
      { status: 503 },
    );
  }

  let products;
  let pageInfo;
  try {
    ({ products, pageInfo } = await loadCatalogProducts(ctx, {
      after: url.searchParams.get("after"),
      q: url.searchParams.get("q")?.trim() ?? "",
      status: url.searchParams.get("status")?.trim() ?? "",
      vendor: url.searchParams.get("vendor")?.trim() ?? "",
      productType: url.searchParams.get("productType")?.trim() ?? "",
    }));
  } catch (e) {
    console.error("[app.products] catalog load failed", e);
    const msg =
      e instanceof Error ? e.message : "Could not load products from Shopify.";
    throw new Response(msg, { status: 502 });
  }

  const filterSubmitted = url.searchParams.get("submitted") ?? "all";
  const filtered =
    filterSubmitted === "submitted"
      ? products.filter((p) => p.submissionStatus !== "not_submitted")
      : filterSubmitted === "not_submitted"
        ? products.filter((p) => p.submissionStatus === "not_submitted")
        : products;

  const selectedCount = await countSelectedProducts(ctx.shopDomain);

  return {
    mode: ctx.mode,
    products: filtered,
    pageInfo,
    viewMode: preference?.productViewMode ?? (viewParam === "list" ? "list" : cookieView === "list" ? "list" : "grid"),
    query: url.searchParams.get("q") ?? "",
    filterSubmitted,
    status: url.searchParams.get("status") ?? "",
    vendor: url.searchParams.get("vendor") ?? "",
    productType: url.searchParams.get("productType") ?? "",
    selectedCount,
    searchParams: url.searchParams.toString(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "set-view") {
    const view = form.get("view") === "list" ? "list" : "grid";
    await prisma.merchantUiPreference.upsert({
      where: { shopDomain: ctx.shopDomain },
      create: { shopDomain: ctx.shopDomain, productViewMode: view },
      update: { productViewMode: view },
    });
    return new Response(null, {
      headers: {
        "Set-Cookie": `${VIEW_COOKIE}=${view}; Path=/; Max-Age=31536000; SameSite=Lax`,
      },
    });
  }

  if (intent === "toggle-product") {
    const productGid = String(form.get("productGid") ?? "");
    const selected = form.get("selected") === "true";
    if (!productGid) {
      return { ok: false, error: "Missing product" };
    }

    let variantGids: string[] = [];
    if (selected) {
      if (ctx.mode === "preview") {
        const mock = MOCK_CATALOG_PRODUCTS.find((p) => p.id === productGid);
        variantGids = mock?.variants.map((v) => v.id) ?? [];
      } else if (ctx.admin) {
        variantGids = await fetchProductVariantGids(ctx.admin, productGid);
      }
    }

    await setProductSelected(ctx.shopDomain, productGid, selected, variantGids);
    return { ok: true };
  }

  return null;
};

function ProductCheckbox({ product }: { product: CatalogProduct }) {
  const submit = useSubmit();
  return (
    <input
      type="checkbox"
      checked={product.selected}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("intent", "toggle-product");
        fd.set("productGid", product.id);
        fd.set("selected", e.target.checked ? "true" : "false");
        submit(fd, { method: "post" });
      }}
    />
  );
}

export default function ProductsPage() {
  const { products, viewMode, query, mode, filterSubmitted, pageInfo, selectedCount, status, vendor, productType } =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();

  const toggleView = (view: "grid" | "list") => {
    const fd = new FormData();
    fd.set("intent", "set-view");
    fd.set("view", view);
    submit(fd, { method: "post" });
  };

  const paginationBase = () => {
    const p = new URLSearchParams(searchParams);
    p.delete("after");
    return p;
  };

  return (
    <s-page heading="Products">
      <s-section>
        <s-stack direction="block" gap="base">
          <Form method="get" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <input type="hidden" name="view" value={viewMode} />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search title"
              style={{ flex: "1 1 180px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e4e4e7" }}
            />
            <input
              name="vendor"
              defaultValue={vendor}
              placeholder="Vendor"
              style={{ flex: "0 1 120px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e4e4e7" }}
            />
            <input
              name="productType"
              defaultValue={productType}
              placeholder="Product type"
              style={{ flex: "0 1 120px", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e4e4e7" }}
            />
            <select
              name="status"
              defaultValue={status}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #e4e4e7" }}
            >
              <option value="">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select
              name="submitted"
              defaultValue={filterSubmitted}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #e4e4e7" }}
            >
              <option value="all">All submission states</option>
              <option value="not_submitted">Not submitted</option>
              <option value="submitted">Submitted or later</option>
            </select>
            <s-button type="submit">Apply</s-button>
          </Form>

          <s-stack direction="inline" gap="base">
            <s-button variant={viewMode === "grid" ? "primary" : "secondary"} onClick={() => toggleView("grid")}>
              Grid
            </s-button>
            <s-button variant={viewMode === "list" ? "primary" : "secondary"} onClick={() => toggleView("list")}>
              List
            </s-button>
            <s-text>
              {selectedCount} selected · {mode === "preview" ? "Preview data" : "Live Shopify catalog"}
            </s-text>
            {selectedCount > 0 ? (
              <s-link href="/app/selected">
                <s-button variant="tertiary">Review selection</s-button>
              </s-link>
            ) : null}
          </s-stack>
        </s-stack>
      </s-section>

      {products.length === 0 ? (
        <s-section>
          <s-paragraph>No products match your filters.</s-paragraph>
        </s-section>
      ) : viewMode === "grid" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "16px",
            padding: "0 16px 24px",
          }}
        >
          {products.map((product) => (
            <article
              key={product.id}
              style={{
                border: "1px solid #e4e4e7",
                borderRadius: "12px",
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <img
                src={product.imageUrl ?? PLACEHOLDER_IMAGE}
                alt=""
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }}
              />
              <div style={{ padding: "12px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <ProductCheckbox product={product} />
                  <span>
                    <strong>{product.title}</strong>
                    <div style={{ fontSize: "12px", color: "#71717a", marginTop: "4px" }}>
                      {product.variantCount} variants · {product.totalInventory} in stock · from {product.currencyCode}{" "}
                      {product.priceFrom}
                    </div>
                    <div style={{ fontSize: "12px", marginTop: "4px" }}>{submissionLabel(product.submissionStatus)}</div>
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <s-section>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e4e4e7" }}>
                  <th style={{ padding: "8px" }} />
                  <th style={{ padding: "8px" }}>Product</th>
                  <th style={{ padding: "8px" }}>SKU</th>
                  <th style={{ padding: "8px" }}>Variants</th>
                  <th style={{ padding: "8px" }}>Inventory</th>
                  <th style={{ padding: "8px" }}>Price</th>
                  <th style={{ padding: "8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ padding: "8px" }}>
                      <ProductCheckbox product={product} />
                    </td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <img
                          src={product.imageUrl ?? PLACEHOLDER_IMAGE}
                          alt=""
                          width={40}
                          height={40}
                          style={{ borderRadius: "6px", objectFit: "cover" }}
                        />
                        {product.title}
                      </div>
                    </td>
                    <td style={{ padding: "8px" }}>{product.primarySku ?? "—"}</td>
                    <td style={{ padding: "8px" }}>{product.variantCount}</td>
                    <td style={{ padding: "8px" }}>{product.totalInventory}</td>
                    <td style={{ padding: "8px" }}>
                      {product.currencyCode} {product.priceFrom}
                    </td>
                    <td style={{ padding: "8px" }}>{submissionLabel(product.submissionStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </s-section>
      )}

      {pageInfo.hasNextPage && pageInfo.endCursor ? (
        <s-section>
          <Link
            to={`?${(() => {
              const p = paginationBase();
              p.set("after", pageInfo.endCursor!);
              return p.toString();
            })()}`}
          >
            <s-button>Next page</s-button>
          </Link>
        </s-section>
      ) : null}
    </s-page>
  );
}

export function ErrorBoundary() {
  return <EmbeddedAppErrorBoundary heading="Products" />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
