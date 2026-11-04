import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { requireMerchantContext } from "../lib/merchant-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const submissions = await prisma.submission.findMany({
    where: { shopDomain: ctx.shopDomain },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });
  return { submissions };
};

export default function SubmissionsPage() {
  const { submissions } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Submissions">
      <s-section>
        <s-paragraph>Track import status for products submitted to Ethos Employee.</s-paragraph>
        <s-link href="/app/selected">
          <s-button variant="tertiary">Back to selected products</s-button>
        </s-link>
      </s-section>
      {submissions.length === 0 ? (
        <s-section>
          <s-paragraph>No submissions yet.</s-paragraph>
        </s-section>
      ) : (
        submissions.map((s) => (
          <s-section key={s.id} heading={`${s.status} · ${s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "Draft"}`}>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px" }}>
              {s.lines.map((line) => (
                <li key={line.id} style={{ padding: "8px 0", borderBottom: "1px solid #f4f4f5" }}>
                  <strong>{line.status}</strong> · {line.shopifyProductGid}
                  {line.errorMessage ? (
                    <div style={{ color: "#b91c1c", marginTop: "4px" }}>{line.errorMessage}</div>
                  ) : null}
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
