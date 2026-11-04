import { mergeEmbeddedSearchParams } from "./embedded-search-params";

declare global {
  interface Window {
    shopify?: {
      ready?: Promise<void>;
      idToken?: () => Promise<string>;
    };
  }
}

async function sessionAuthorizationHeader(): Promise<string | null> {
  const shopify = window.shopify;
  if (!shopify?.idToken) return null;
  try {
    await (shopify.ready ?? Promise.resolve());
    const token = await shopify.idToken();
    return token ? `Bearer ${token}` : null;
  } catch {
    return null;
  }
}

/** POST/GET to app routes from embedded Admin with session token + preserved query params. */
export async function embeddedAppFetch(
  path: string,
  init: RequestInit,
  currentSearch: string,
): Promise<Response> {
  const url = mergeEmbeddedSearchParams(path, currentSearch);
  const headers = new Headers(init.headers);
  const auth = await sessionAuthorizationHeader();
  if (auth) {
    headers.set("Authorization", auth);
  }
  return fetch(url, { ...init, headers, credentials: "same-origin" });
}

export async function readAppJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      throw new Error(
        "App session expired or the server returned a login page. Refresh this page (or reopen from `pnpm dev` preview) and try again.",
      );
    }
    throw new Error(text.slice(0, 240) || `Request failed (${response.status})`);
  }
}
