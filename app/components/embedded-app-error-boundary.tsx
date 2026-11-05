import { boundary } from "@shopify/shopify-app-react-router/server";
import { isRouteErrorResponse, useRouteError, useRouteLoaderData } from "react-router";
import type { loader as rootLoader } from "../root";

function isShopifyAppBridgeResponse(error: unknown): boolean {
  return (
    isRouteErrorResponse(error) &&
    typeof error.data === "string" &&
    (error.data.includes("app-bridge.js") || error.data.includes("data-api-key"))
  );
}

function isShopifyBotRejection(error: unknown): boolean {
  return isRouteErrorResponse(error) && error.status === 410;
}

function errorMessage(error: unknown): string {
  if (isShopifyBotRejection(error)) {
    return (
      "This request was blocked because the browser looks like an automated client (Shopify auth returns 410 Gone for bots).\n\n" +
      "Open the app from Shopify Admin using Chrome or Safari—not the Cursor embedded browser or curl."
    );
  }
  if (error instanceof Error) return error.message;
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === "string" && error.data.trim()) return error.data;
    if (error.statusText) return error.statusText;
    return `Request failed (${error.status})`;
  }
  if (typeof error === "string" && error.trim()) return error;
  return "Something went wrong loading this page.";
}

function ErrorBody({
  heading,
  message,
  isDev,
  botRejection,
}: {
  heading: string;
  message: string;
  isDev: boolean;
  botRejection: boolean;
}) {
  return (
    <div style={{ padding: "24px", maxWidth: "640px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "18px", margin: "0 0 12px" }}>{heading}</h1>
      <p style={{ fontSize: "14px", color: "#18181b", margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{message}</p>
      {isDev && botRejection ? (
        <p style={{ fontSize: "13px", color: "#71717a", margin: "12px 0 0" }}>
          In the terminal running <code>pnpm dev</code>, press <strong>p</strong> to open the app preview in your
          default browser. For UI-only work without Shopify login, use{" "}
          <code>LOCAL_PREVIEW=1 pnpm dev</code> and open the local Vite URL shown in the CLI.
        </p>
      ) : null}
      {isDev && !botRejection ? (
        <p style={{ fontSize: "13px", color: "#71717a", margin: "12px 0 0" }}>
          Dev: keep <code>pnpm dev</code> running, Postgres tunnel open if using{" "}
          <code>127.0.0.1:15435</code>, then press <strong>p</strong> in the CLI to open the app preview.
        </p>
      ) : null}
      {!isDev ? (
        <p style={{ fontSize: "13px", color: "#71717a", margin: "12px 0 0" }}>
          Production: confirm Railway <code>DATABASE_URL</code>, <code>SHOPIFY_API_KEY</code>, and{" "}
          <code>SHOPIFY_APP_URL</code> match this app in the Partner Dashboard, then redeploy.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Embedded Admin error UI. Shopify auth intentionally throws an HTML App Bridge `Response`
 * (session bounce) — that must go through `boundary.error`, not a generic message.
 */
export function EmbeddedAppErrorBoundary({ heading = "Something went wrong" }: { heading?: string }) {
  const error = useRouteError();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const isDev = root?.isDev === true;

  if (isShopifyAppBridgeResponse(error)) {
    return boundary.error(error);
  }

  if (isRouteErrorResponse(error) && error.status >= 300 && error.status < 400) {
    const target =
      typeof error.data === "string" && /^https?:\/\//.test(error.data) ? error.data : null;
    if (target && typeof window !== "undefined") {
      window.location.assign(target);
      return (
        <div style={{ padding: "24px", fontSize: "14px", color: "#52525b" }}>Reloading app session…</div>
      );
    }
  }

  const botRejection = isShopifyBotRejection(error);
  return (
    <ErrorBody
      heading={botRejection ? "Open in Chrome or Safari" : heading}
      message={errorMessage(error)}
      isDev={isDev}
      botRejection={botRejection}
    />
  );
}
