import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { mergeEmbeddedSearchParams } from "../lib/embedded-search-params";

/** Runs before AppProvider's navigate handler; keeps shop/host/id_token on s-link clicks. */
export function EmbeddedNavigationFix() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const href = (event.target as HTMLElement)?.getAttribute("href");
      if (!href) return;
      event.stopImmediatePropagation();
      navigate(mergeEmbeddedSearchParams(href, location.search));
    };

    document.addEventListener("shopify:navigate", handleNavigate, true);
    return () => document.removeEventListener("shopify:navigate", handleNavigate, true);
  }, [location.search, navigate]);

  return null;
}
