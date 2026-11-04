import type { LoaderFunctionArgs } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

/** Available to route error boundaries (e.g. when `/app` loader fails before rendering AppProvider). */
export const loader = async ({ request: _request }: LoaderFunctionArgs) => ({
  apiKey: process.env.SHOPIFY_API_KEY?.trim() ?? "",
  isDev: process.env.NODE_ENV !== "production",
});

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
