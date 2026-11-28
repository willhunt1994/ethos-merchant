import { useMemo, useState } from "react";
import { CustomProductDetailDrawer } from "./custom-product-detail-drawer";
import { EmptyState } from "./empty-state";
import styles from "../../styles/embedded-app.module.css";
import { PLACEHOLDER_IMAGE } from "../../lib/catalog-product";
import {
  customProductStatusLabel,
  type CustomProductStatus,
  type MockCustomProduct,
} from "../../lib/mock-custom-products";

const CUSTOM_PRODUCTS_PAGE_SIZE = 18;

const STATUS_FILTER_OPTIONS: CustomProductStatus[] = ["active", "draft", "archived"];

type CustomProductsSort = "top_performing" | "newest" | "title";

type TopPerformerRank = 1 | 2 | 3;

function compareTopPerforming(a: MockCustomProduct, b: MockCustomProduct): number {
  const salesDiff = parseUsdAmount(b.totalSalesUsd) - parseUsdAmount(a.totalSalesUsd);
  if (salesDiff !== 0) return salesDiff;
  const unitsDiff = b.unitsPurchased - a.unitsPurchased;
  if (unitsDiff !== 0) return unitsDiff;
  return a.title.localeCompare(b.title);
}

function topPerformerRankBadgeClass(rank: TopPerformerRank): string {
  switch (rank) {
    case 1:
      return `${styles.customProductsRankBadge} ${styles.customProductsRankBadgeGold}`;
    case 2:
      return `${styles.customProductsRankBadge} ${styles.customProductsRankBadgeSilver}`;
    case 3:
      return `${styles.customProductsRankBadge} ${styles.customProductsRankBadgeBronze}`;
  }
}

type CustomProductsPanelProps = {
  products: MockCustomProduct[];
  previewMode: boolean;
};

function statusTagClass(status: CustomProductStatus): string {
  switch (status) {
    case "active":
      return styles.attachmentStatusTagSuccess;
    case "draft":
      return styles.attachmentStatusTagWarning;
    case "archived":
      return styles.attachmentStatusTagNeutral;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

function parseUsdAmount(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatTotalSales(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatCompactUsdThousands(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const rounded = Math.round(millions * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const thousands = amount / 1000;
    const rounded = Math.round(thousands * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCurrencyUsdCompact(raw: string): string {
  return `$${formatCompactUsdThousands(parseUsdAmount(raw))}`;
}

function CustomProductMetaSummary({ product }: { product: MockCustomProduct }) {
  return (
    <div className={styles.customProductsMetaAccordion}>
      <div className={styles.customProductsMetaAccordionStatic}>
        <span className={styles.customProductsMetaAccordionSummaryLabel}>Sales & Activity</span>
        <div className={styles.customProductsMetaAccordionStatGrid}>
          <div className={styles.customProductsMetaAccordionStat}>
            <span className={styles.customProductsMetaAccordionStatHeading}>Units</span>
            <span className={styles.customProductsMetaAccordionStatValue}>
              {product.unitsPurchased.toLocaleString()}
            </span>
          </div>
          <div className={styles.customProductsMetaAccordionStat}>
            <span className={styles.customProductsMetaAccordionStatHeading}>Sales</span>
            <span className={styles.customProductsMetaAccordionStatValue}>
              {formatCurrencyUsdCompact(product.totalSalesUsd)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CustomProductsPanel({ products, previewMode }: CustomProductsPanelProps) {
  const [query, setQuery] = useState("");
  const [baseProductGid, setBaseProductGid] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | CustomProductStatus>("");
  const [sortBy, setSortBy] = useState<CustomProductsSort>("top_performing");
  const [page, setPage] = useState(1);
  const [detailProduct, setDetailProduct] = useState<MockCustomProduct | null>(null);

  const baseProductOptions = useMemo(() => {
    const byGid = new Map<string, { gid: string; title: string; count: number }>();
    for (const product of products) {
      const existing = byGid.get(product.baseProductGid);
      if (existing) {
        existing.count += 1;
      } else {
        byGid.set(product.baseProductGid, {
          gid: product.baseProductGid,
          title: product.baseProductTitle,
          count: 1,
        });
      }
    }
    return [...byGid.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [products]);

  const statusCounts = useMemo(() => {
    const counts: Record<CustomProductStatus, number> = {
      active: 0,
      draft: 0,
      archived: 0,
    };
    for (const product of products) {
      counts[product.status] += 1;
    }
    return counts;
  }, [products]);

  const filteredAndSorted = useMemo(() => {
    let list = products;
    if (baseProductGid) {
      list = list.filter((p) => p.baseProductGid === baseProductGid);
    }
    if (statusFilter) {
      list = list.filter((p) => p.status === statusFilter);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.ethosSku.toLowerCase().includes(q) ||
          p.baseProductTitle.toLowerCase().includes(q),
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => b.firstListedAt.localeCompare(a.firstListedAt));
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "top_performing":
      default:
        sorted.sort(compareTopPerforming);
        break;
    }
    return sorted;
  }, [products, query, baseProductGid, statusFilter, sortBy]);

  const topPerformerRanks = useMemo(() => {
    const ranked = [...filteredAndSorted].sort(compareTopPerforming);
    const ranks = new Map<string, TopPerformerRank>();
    for (let index = 0; index < Math.min(3, ranked.length); index++) {
      ranks.set(ranked[index].id, (index + 1) as TopPerformerRank);
    }
    return ranks;
  }, [filteredAndSorted]);

  const totalCount = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOM_PRODUCTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const paginatedProducts = useMemo(() => {
    const start = (safePage - 1) * CUSTOM_PRODUCTS_PAGE_SIZE;
    return filteredAndSorted.slice(start, start + CUSTOM_PRODUCTS_PAGE_SIZE);
  }, [filteredAndSorted, safePage]);

  const activeCount = products.filter((p) => p.status === "active").length;
  const totalUnits = products.reduce((sum, p) => sum + p.unitsPurchased, 0);
  const totalOrders = products.reduce((sum, p) => sum + p.orderCount, 0);
  const totalSales = products.reduce((sum, p) => sum + parseUsdAmount(p.totalSalesUsd), 0);

  const openProductDetail = (product: MockCustomProduct) => setDetailProduct(product);

  return (
    <>
      <CustomProductDetailDrawer
        product={detailProduct}
        open={detailProduct !== null}
        onClose={() => setDetailProduct(null)}
      />
      <s-section>
        {previewMode ? (
          <p className={styles.productMeta} role="status">
            Sample data for layout only. Live purchase reporting will connect to Ethos when the API
            is available.
          </p>
        ) : null}
        <div className={`${styles.pageTitleRow} ${styles.customProductsOverviewHeader}`}>
          <h2 className={styles.pageHeading}>Overview</h2>
          <button
            type="button"
            className={styles.customProductsReportsLink}
            disabled
          >
            Reports <span aria-hidden>↗</span>
          </button>
        </div>
        <div className={styles.customProductsMetricGrid}>
          <article className={styles.customProductsMetricCard}>
            <p className={styles.customProductsMetricLabel}>Active Custom Products</p>
            <div className={styles.customProductsMetricValue}>{activeCount}</div>
          </article>
          <article className={styles.customProductsMetricCard}>
            <p className={styles.customProductsMetricLabel}>Units Purchased</p>
            <div className={styles.customProductsMetricValue}>{totalUnits.toLocaleString()}</div>
          </article>
          <article className={styles.customProductsMetricCard}>
            <p className={styles.customProductsMetricLabel}>Orders</p>
            <div className={styles.customProductsMetricValue}>{totalOrders.toLocaleString()}</div>
          </article>
          <article className={styles.customProductsMetricCard}>
            <p className={styles.customProductsMetricLabel}>Total Sales</p>
            <div className={styles.customProductsMetricValue}>{formatTotalSales(totalSales)}</div>
          </article>
        </div>
      </s-section>

      <s-section>
        <h2 className={`${styles.settingsPanelTitle} ${styles.customProductsSectionHeading}`}>
          Custom Products
        </h2>
        <p className={`${styles.productMeta} ${styles.customProductsSectionIntro}`}>
          Custom products available for Ethos customers to purchase.
        </p>
        <div className={styles.filterRow}>
          <input
            type="search"
            className={styles.fieldGrow}
            placeholder="Search title or SKU"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            aria-label="Search custom products"
          />
          <select
            className={`${styles.fieldSelect} ${styles.customProductsBaseProductFilter}`}
            value={baseProductGid}
            onChange={(e) => {
              setBaseProductGid(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by base product customized from"
          >
            <option value="">All Base Products</option>
            {baseProductOptions.map((option) => (
              <option key={option.gid} value={option.gid}>
                {option.title} ({option.count})
              </option>
            ))}
          </select>
          <select
            className={`${styles.fieldSelect} ${styles.customProductsStatusFilter}`}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | CustomProductStatus);
              setPage(1);
            }}
            aria-label="Filter by custom product status"
          >
            <option value="">All Statuses</option>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {customProductStatusLabel(status)} ({statusCounts[status]})
              </option>
            ))}
          </select>
          <select
            className={`${styles.fieldSelect} ${styles.customProductsSortFilter}`}
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as CustomProductsSort);
              setPage(1);
            }}
            aria-label="Sort custom products"
          >
            <option value="top_performing">Top Performing</option>
            <option value="newest">Newest</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>

        {filteredAndSorted.length === 0 ? (
          <EmptyState
            title="No matching custom products"
            description="Try a different search, base product, or status filter."
          />
        ) : (
          <>
            <div className={`${styles.productGrid} ${styles.customProductsGrid}`}>
              {paginatedProducts.map((product) => (
                <article key={product.id} className={styles.productCard}>
                  <div className={styles.productMedia}>
                    <button
                      type="button"
                      className={styles.customProductsCardMediaButton}
                      onClick={() => openProductDetail(product)}
                      aria-label={`View details for ${product.title}`}
                    >
                      <img
                        src={product.imageUrl || PLACEHOLDER_IMAGE}
                        alt=""
                        className={styles.productImage}
                      />
                    </button>
                    {(() => {
                      const rank = topPerformerRanks.get(product.id);
                      if (!rank) return null;
                      const rankLabels: Record<TopPerformerRank, string> = {
                        1: "Gold — top performer",
                        2: "Silver — second place",
                        3: "Bronze — third place",
                      };
                      return (
                        <span
                          className={topPerformerRankBadgeClass(rank)}
                          title={rankLabels[rank]}
                          aria-label={`Rank ${rank} top performer`}
                        >
                          {rank}
                        </span>
                      );
                    })()}
                    <div className={styles.productStatusOverlay}>
                      <span className={statusTagClass(product.status)}>
                        {customProductStatusLabel(product.status)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.productBody}>
                    <button
                      type="button"
                      className={styles.customProductsCardTitleButton}
                      onClick={() => openProductDetail(product)}
                    >
                      {product.title}
                    </button>
                    <p className={styles.productType}>
                      Customized from: {product.baseProductTitle}
                    </p>
                    <p className={styles.productMeta}>
                      Designed on {formatDate(product.firstListedAt)}
                    </p>
                    <CustomProductMetaSummary product={product} />
                  </div>
                </article>
              ))}
            </div>
            <div className={styles.customProductsGridFooter}>
              <p className={styles.productMeta}>
                {totalCount.toLocaleString()} custom product{totalCount === 1 ? "" : "s"}
              </p>
              {totalPages > 1 ? (
                <div className={styles.customProductsPagination}>
                  <button
                    type="button"
                    className={styles.settingsButton}
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    Previous
                  </button>
                  <span className={styles.productMeta}>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.settingsButton}
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </s-section>
    </>
  );
}