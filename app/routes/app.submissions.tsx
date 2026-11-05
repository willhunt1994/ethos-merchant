import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { EmptyState } from "../components/embedded/empty-state";
import styles from "../styles/embedded-app.module.css";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { fetchProductSummariesByGids } from "../lib/shopify/products.server";

function lineStatusTone(status: string): "success" | "warning" | "critical" | "info" | "neutral" {
  if (status === "imported") return "success";
  if (status === "failed") return "critical";
  if (status === "needs_attention") return "warning";
  if (status === "processing") return "info";
  return "neutral";
}

function batchStatusTone(status: string): "success" | "warning" | "critical" | "info" | "neutral" {
  if (status === "imported") return "success";
  if (status === "failed") return "critical";
  if (status === "needs_attention") return "warning";
  return "info";
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
  const titleByGid = new Map<string, string>();

  if (ctx.mode === "shopify" && ctx.admin && gids.length > 0) {
    const summaries = await fetchProductSummariesByGids(ctx.admin, gids);
    for (const [gid, summary] of summaries) {
      titleByGid.set(gid, summary.title);
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
        title: titleByGid.get(line.shopifyProductGid) ?? line.shopifyProductGid,
        itemCode: itemCodeByGid.get(line.shopifyProductGid) ?? null,
        errorMessage: line.errorMessage,
      })),
    })),
  };
};

export default function SubmissionsPage() {
  const { submissions } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Submissions">
      <s-section>
        <s-paragraph>History of products sent to Ethos Employee and per-line import results.</s-paragraph>
        <s-link href="/app/selected">
          <s-button variant="tertiary">Back to selected products</s-button>
        </s-link>
      </s-section>

      {submissions.length === 0 ? (
        <s-section>
          <EmptyState
            title="No submissions yet"
            description="Submit configured products from Selected products to see status here."
            action={
              <s-link href="/app/selected">
                <s-button variant="primary">Go to selection</s-button>
              </s-link>
            }
          />
        </s-section>
      ) : (
        submissions.map((s) => (
          <s-section
            key={s.id}
            heading={
              s.submittedAt
                ? new Date(s.submittedAt).toLocaleString()
                : new Date(s.createdAt).toLocaleString()
            }
          >
            <s-badge tone={batchStatusTone(s.status)}>{s.status}</s-badge>
            <ul className={styles.rowList} style={{ marginTop: "0.75rem" }}>
              {s.lines.map((line) => (
                <li key={line.id} className={styles.rowItem}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{line.title}</strong>
                    {line.itemCode ? (
                      <div className={styles.productMeta}>Ethos item {line.itemCode}</div>
                    ) : null}
                    {line.errorMessage ? (
                      <div style={{ color: "#d72c0d", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                        {line.errorMessage}
                      </div>
                    ) : null}
                  </div>
                  <s-badge tone={lineStatusTone(line.status)}>{line.status}</s-badge>
                </li>
              ))}
            </ul>
          </s-section>
        ))
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
