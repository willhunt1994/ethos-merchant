import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { Form, Link, useFetcher, useLoaderData, useSearchParams, useSubmit } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { EmbeddedAppErrorBoundary } from "../components/embedded-app-error-boundary";
import { EmptyState } from "../components/embedded/empty-state";
import { SubmissionStatusBadge } from "../components/embedded/submission-status-badge";
import styles from "../styles/embedded-app.module.css";
import { PLACEHOLDER_IMAGE, type CatalogProduct } from "../lib/catalog-product";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { MOCK_CATALOG_PRODUCTS } from "../lib/mock-catalog";
import {
  countSelectedProducts,
  getSelectedProductGids,
  getSubmissionStatusByProductGid,
  setProductSelected,
} from "../lib/product-selection.server";
import {
  aggregateProductTypeCounts,
  fetchProductTypeCounts,
  fetchProductVariantGids,
  fetchProductsPage,
} from "../lib/shopify/products.server";

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
      if (params.productType === "__uncategorized__") {
        if (p.productType.trim()) return false;
      } else if (
        params.productType &&
        !p.productType.toLowerCase().includes(params.productType.toLowerCase())
      ) {
        return false;
      }
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
    productType:
      params.productType && params.productType !== "__uncategorized__"
        ? params.productType
        : undefined,
  });

  const pageProducts =
    params.productType === "__uncategorized__"
      ? page.products.filter((p) => !p.productType?.trim())
      : page.products;

  const gids = pageProducts.map((p) => p.id);
  const statuses = await getSubmissionStatusByProductGid(ctx.shopDomain, gids);

  const products: CatalogProduct[] = pageProducts.map((p) => ({
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

async function loadProductTypeOptions(
  ctx: Awaited<ReturnType<typeof requireMerchantContext>>,
  params: { q: string; status: string; vendor: string },
) {
  if (ctx.mode === "preview") {
    const q = params.q.toLowerCase();
    const list = MOCK_CATALOG_PRODUCTS.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q) && !p.vendor.toLowerCase().includes(q)) {
        return false;
      }
      if (params.status && p.status !== params.status) return false;
      if (params.vendor && !p.vendor.toLowerCase().includes(params.vendor.toLowerCase())) {
        return false;
      }
      return true;
    });
    return aggregateProductTypeCounts(list);
  }

  if (!ctx.admin) {
    return [];
  }

  return fetchProductTypeCounts(ctx.admin, {
    q: params.q || undefined,
    status: params.status || undefined,
    vendor: params.vendor || undefined,
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const url = new URL(request.url);
  const catalogParams = {
    after: url.searchParams.get("after"),
    q: url.searchParams.get("q")?.trim() ?? "",
    status: url.searchParams.get("status")?.trim() ?? "",
    vendor: url.searchParams.get("vendor")?.trim() ?? "",
    productType: url.searchParams.get("productType")?.trim() ?? "",
  };

  let products;
  let pageInfo;
  let productTypeOptions: Awaited<ReturnType<typeof loadProductTypeOptions>>;
  try {
    const [catalogResult, typeOptions] = await Promise.all([
      loadCatalogProducts(ctx, catalogParams),
      loadProductTypeOptions(ctx, {
        q: catalogParams.q,
        status: catalogParams.status,
        vendor: catalogParams.vendor,
      }),
    ]);
    ({ products, pageInfo } = catalogResult);
    productTypeOptions = typeOptions;
  } catch (e) {
    console.error("[app.products] catalog load failed", e);
    const msg =
      e instanceof Error ? e.message : "Could not load products from Shopify.";
    throw new Response(msg, { status: 502 });
  }

  const selectedCount = await countSelectedProducts(ctx.shopDomain);

  return {
    mode: ctx.mode,
    products,
    pageInfo,
    query: url.searchParams.get("q") ?? "",
    productType: url.searchParams.get("productType") ?? "",
    productTypeOptions,
    selectedCount,
    searchParams: url.searchParams.toString(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const form = await request.formData();
  const intent = form.get("intent");

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
    const selectedCount = await countSelectedProducts(ctx.shopDomain);
    return { ok: true, productGid, selected, selectedCount };
  }

  return null;
};

export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (formData?.get("intent") === "toggle-product") {
    return false;
  }
  return defaultShouldRevalidate;
}

function ProductMetaSummary({ product }: { product: CatalogProduct }) {
  return (
    <ul className={styles.productMetaList}>
      <li className={styles.productMetaRow}>
        <span className={styles.productMetaKey}>Availability</span>
        <span className={styles.productMetaValue}>{product.totalInventory}</span>
      </li>
      <li className={styles.productMetaRow}>
        <span className={styles.productMetaKey}>Pricing</span>
        <span className={styles.productMetaValue}>
          {product.currencyCode} {product.priceFrom}
        </span>
      </li>
    </ul>
  );
}

function ProductCheckbox({
  product,
  className,
  onToggle,
}: {
  product: CatalogProduct;
  className?: string;
  onToggle: (productGid: string, selected: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className={className}
      checked={product.selected}
      onChange={(e) => {
        onToggle(product.id, e.target.checked);
      }}
    />
  );
}

type ProductsLoaderData = Awaited<ReturnType<typeof loader>>;

export default function ProductsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  return <ProductsPageContent key={searchParams.toString()} {...loaderData} />;
}

function ProductsPageContent({
  products,
  query,
  pageInfo,
  selectedCount,
  productType,
  productTypeOptions,
}: ProductsLoaderData) {
  const [searchParams] = useSearchParams();
  const filterSubmit = useSubmit();
  const filterFormRef = useRef<HTMLFormElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchQ, setSearchQ] = useState(query);

  const submitProductFilters = useCallback(() => {
    if (!filterFormRef.current) return;
    filterSubmit(filterFormRef.current, { method: "get", replace: true });
  }, [filterSubmit]);

  const toggleFetcher = useFetcher<{
    ok?: boolean;
    selectedCount?: number;
    productGid?: string;
    selected?: boolean;
  }>();

  const [catalogProducts, setCatalogProducts] = useState(products);
  const [selectionCount, setSelectionCount] = useState(selectedCount);

  useEffect(() => {
    const data = toggleFetcher.data;
    if (!data?.ok || data.selectedCount === undefined) return;
    queueMicrotask(() => {
      setSelectionCount(data.selectedCount!);
      if (data.productGid && typeof data.selected === "boolean") {
        setCatalogProducts((prev) =>
          prev.map((p) =>
            p.id === data.productGid ? { ...p, selected: data.selected! } : p,
          ),
        );
      }
    });
  }, [toggleFetcher.data]);

  const toggleProductSelection = useCallback(
    (productGid: string, selected: boolean) => {
      setCatalogProducts((prev) =>
        prev.map((p) => (p.id === productGid ? { ...p, selected } : p)),
      );
      setSelectionCount((count) => count + (selected ? 1 : -1));

      const fd = new FormData();
      fd.set("intent", "toggle-product");
      fd.set("productGid", productGid);
      fd.set("selected", selected ? "true" : "false");
      toggleFetcher.submit(fd, { method: "post" });
    },
    [toggleFetcher],
  );

  const paginationBase = () => {
    const p = new URLSearchParams(searchParams);
    p.delete("after");
    return p;
  };

  return (
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>Products</h1>
        {selectionCount > 0 ? (
          <Link to="/app/selected" className={styles.primarySubmitButton}>
            Review Selection ({selectionCount})
          </Link>
        ) : null}
      </div>
      <s-section>
        <s-stack direction="block" gap="base">
          <Form method="get" className={styles.filterRow} ref={filterFormRef}>
            <input
              name="q"
              value={searchQ}
              onChange={(e) => {
                const next = e.target.value;
                setSearchQ(next);
                if (searchDebounceRef.current) {
                  clearTimeout(searchDebounceRef.current);
                }
                searchDebounceRef.current = setTimeout(() => {
                  if (!filterFormRef.current) return;
                  filterSubmit(filterFormRef.current, { method: "get", replace: true });
                }, 300);
              }}
              placeholder="Search title"
              className={styles.fieldGrow}
              aria-label="Search products"
            />
            <select
              name="productType"
              value={productType}
              className={styles.fieldSelect}
              aria-label="Product type filter"
              onChange={submitProductFilters}
            >
              <option value="">All product types</option>
              {productTypeOptions.map((option) => (
                <option
                  key={option.productType}
                  value={
                    option.productType === "Uncategorized"
                      ? "__uncategorized__"
                      : option.productType
                  }
                >
                  {option.productType} ({option.count})
                </option>
              ))}
            </select>
          </Form>
        </s-stack>
      </s-section>

      {catalogProducts.length === 0 ? (
        <s-section>
          <EmptyState
            title="No products found"
            description="Try clearing filters or search with a different title."
            action={
              <s-link href="/app/products">
                <s-button variant="secondary">Reset filters</s-button>
              </s-link>
            }
          />
        </s-section>
      ) : (
        <s-section>
          <div className={styles.productGrid}>
            {catalogProducts.map((product) => (
              <article
                key={product.id}
                className={product.selected ? styles.productCardSelected : styles.productCard}
              >
                <div className={styles.productMedia}>
                  <img
                    src={product.imageUrl ?? PLACEHOLDER_IMAGE}
                    alt=""
                    className={styles.productImage}
                  />
                  <div className={styles.productSelectOverlay}>
                    <ProductCheckbox
                      product={product}
                      className={styles.productSelectCheckbox}
                      onToggle={toggleProductSelection}
                    />
                  </div>
                  {product.submissionStatus !== "not_submitted" ? (
                    <div className={styles.productStatusOverlay}>
                      <SubmissionStatusBadge status={product.submissionStatus} />
                    </div>
                  ) : null}
                </div>
                <div className={styles.productBody}>
                  <div className={styles.productTitle}>{product.title}</div>
                  {product.productType ? (
                    <p className={styles.productType}>{product.productType}</p>
                  ) : null}
                  <ProductMetaSummary product={product} />
                </div>
              </article>
            ))}
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
