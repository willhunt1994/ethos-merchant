import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { EmptyState } from "../components/embedded/empty-state";
import { PLACEHOLDER_IMAGE } from "../lib/catalog-product";
import styles from "../styles/embedded-app.module.css";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { MOCK_CATALOG_PRODUCTS } from "../lib/mock-catalog";
import { fetchProductSummariesByGids } from "../lib/shopify/products.server";

type LineStatus = string;
type BatchStatus = string;

function lineStatusLabel(status: LineStatus): string {
  switch (status) {
    case "imported":
      return "Submitted";
    case "failed":
      return "Failed";
    case "needs_attention":
      return "Needs Attention";
    case "processing":
      return "Processing";
    case "submitted":
      return "Submitted";
    default:
      return status.replace(/_/g, " ");
  }
}

function batchStatusLabel(status: BatchStatus): string {
  switch (status) {
    case "imported":
      return "Complete";
    case "failed":
      return "Failed";
    case "needs_attention":
      return "Needs Attention";
    case "processing":
      return "Processing";
    case "submitted":
      return "Submitted";
    default:
      return status.replace(/_/g, " ");
  }
}

function lineStatusTagClass(status: LineStatus): string {
  if (status === "imported" || status === "submitted") return styles.attachmentStatusTagSuccess;
  if (status === "failed") return styles.attachmentStatusTagDanger;
  if (status === "needs_attention") return styles.attachmentStatusTagWarning;
  return styles.attachmentStatusTagNeutral;
}

function batchStatusTagClass(status: BatchStatus): string {
  if (status === "imported") return styles.attachmentStatusTagSuccess;
  if (status === "failed") return styles.attachmentStatusTagDanger;
  if (status === "needs_attention") return styles.attachmentStatusTagWarning;
  return styles.attachmentStatusTagNeutral;
}

function formatBatchWhen(iso: string | null, fallbackIso: string): string {
  const raw = iso ?? fallbackIso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(raw));
}

function batchSummaryLines(lines: { status: string }[]): string {
  const imported = lines.filter((l) => l.status === "imported").length;
  const failed = lines.filter((l) => l.status === "failed").length;
  const parts = [`${lines.length} product(s)`];
  if (imported > 0) parts.push(`${imported} submitted`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const submissions = await prisma.submission.findMany({
    where: { shopDomain: ctx.shopDomain },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });

  const gids = [...new Set(submissions.flatMap((s) => s.lines.map((l) => l.shopifyProductGid)))];
  const mockById = new Map(MOCK_CATALOG_PRODUCTS.map((p) => [p.id, p]));
  const titleByGid = new Map<string, string>();
  const imageByGid = new Map<string, string | null>();

  for (const gid of gids) {
    const mock = mockById.get(gid);
    if (mock) {
      titleByGid.set(gid, mock.title);
      imageByGid.set(gid, mock.imageUrl ?? null);
    }
  }

  if (ctx.mode === "shopify" && ctx.admin && gids.length > 0) {
    const summaries = await fetchProductSummariesByGids(ctx.admin, gids);
    for (const [gid, summary] of summaries) {
      titleByGid.set(gid, summary.title);
      imageByGid.set(gid, summary.imageUrl ?? null);
    }
  }

  const maps = await prisma.shopifyProductMap.findMany({
    where: { shopDomain: ctx.shopDomain, shopifyProductGid: { in: gids } },
    select: { shopifyProductGid: true, itemCode: true },
  });
  const itemCodeByGid = new Map(maps.map((m) => [m.shopifyProductGid, m.itemCode]));

  return {
    submissions: submissions.map((s) => ({
      id: s.id,
      status: s.status,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      lines: s.lines.map((line) => ({
        id: line.id,
        status: line.status,
        shopifyProductGid: line.shopifyProductGid,
        title: titleByGid.get(line.shopifyProductGid) ?? "Selected product",
        imageUrl: imageByGid.get(line.shopifyProductGid) ?? null,
        itemCode: itemCodeByGid.get(line.shopifyProductGid) ?? null,
        errorMessage: line.errorMessage,
      })),
    })),
  };
};

export default function SubmissionsPage() {
  const { submissions } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>Submissions</h1>
        <Link to="/app/selected" className={styles.settingsButton}>
          Back to Selected
        </Link>
      </div>

      <s-section>
        <p className={styles.productMeta}>
          History of products sent to Ethos, with per-product import results from each batch.
        </p>
      </s-section>

      {submissions.length === 0 ? (
        <s-section>
          <EmptyState
            title="No submissions yet"
            description="Submit configured products from Selected products to see status here."
            action={
              <Link to="/app/selected" className={styles.primarySubmitButton}>
                Go to Selected
              </Link>
            }
          />
        </s-section>
      ) : (
        <s-section>
          <div className={styles.submissionBatchList}>
            {submissions.map((batch) => (
              <article key={batch.id} className={styles.submissionBatchCard}>
                <header className={styles.submissionBatchHeader}>
                  <div>
                    <h2 className={styles.submissionBatchTitle}>
                      {formatBatchWhen(batch.submittedAt, batch.createdAt)}
                    </h2>
                    <p className={styles.submissionBatchMeta}>{batchSummaryLines(batch.lines)}</p>
                  </div>
                  <span className={batchStatusTagClass(batch.status)}>
                    {batchStatusLabel(batch.status)}
                  </span>
                </header>
                <ul className={styles.submissionBatchLines}>
                  {batch.lines.map((line) => (
                    <li key={line.id} className={styles.rowItem}>
                      <img
                        src={line.imageUrl ?? PLACEHOLDER_IMAGE}
                        alt=""
                        className={styles.thumbRow}
                      />
                      <div className={styles.rowItemMain}>
                        <strong>{line.title}</strong>
                        {line.itemCode ? (
                          <p className={styles.productMeta}>Ethos item {line.itemCode}</p>
                        ) : null}
                        {line.errorMessage ? (
                          <p className={styles.submissionLineError}>{line.errorMessage}</p>
                        ) : null}
                      </div>
                      <Link
                        to={`/app/selected/configure?productGid=${encodeURIComponent(line.shopifyProductGid)}`}
                        className={styles.submissionLineViewLink}
                      >
                        View
                      </Link>
                      <span className={lineStatusTagClass(line.status)}>
                        {lineStatusLabel(line.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
