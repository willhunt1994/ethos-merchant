/** Query params Shopify Admin keeps on embedded app URLs. */
const PRESERVED_PARAMS = ["shop", "host", "embedded", "locale", "session", "id_token"] as const;

/** Keep embedded session params when navigating in-app (App Bridge s-link → React Router). */
export function mergeEmbeddedSearchParams(path: string, currentSearch: string): string {
  const base =
    typeof window !== "undefined" ? window.location.origin : "https://app.example.com";
  const next = new URL(path, base);
  const current = new URLSearchParams(currentSearch);

  for (const key of PRESERVED_PARAMS) {
    const value = current.get(key);
    if (value && !next.searchParams.has(key)) {
      next.searchParams.set(key, value);
    }
  }

  return `${next.pathname}${next.search}`;
}
