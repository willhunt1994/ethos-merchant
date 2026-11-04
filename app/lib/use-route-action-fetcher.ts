import { useFetcher } from "react-router";
import { useCallback, useEffect, useRef } from "react";

type ActionJson = { ok?: boolean; error?: string };

/**
 * POST JSON actions on the current route (keeps embedded ?shop=&host=&id_token= on the request URL).
 * Do not pass a custom `action` URL — that strips session params and returns HTML login pages.
 */
export function useRouteActionFetcher<T extends ActionJson>() {
  const fetcher = useFetcher<T>();
  const pendingRef = useRef<{
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  } | null>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !pendingRef.current) return;

    const { resolve, reject } = pendingRef.current;
    pendingRef.current = null;

    const data = fetcher.data;
    if (data === undefined) {
      reject(
        new Error(
          "No response from server (session may have expired). Refresh this page and try again.",
        ),
      );
      return;
    }

    if (data.ok === false) {
      reject(new Error(data.error ?? "Request failed"));
      return;
    }

    resolve(data as T);
  }, [fetcher.state, fetcher.data]);

  const submit = useCallback(
    (formData: FormData, options?: { multipart?: boolean }) =>
      new Promise<T>((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        const multipart =
          options?.multipart ??
          [...formData.values()].some(
            (value) =>
              (typeof File !== "undefined" && value instanceof File) ||
              (typeof Blob !== "undefined" && value instanceof Blob),
          );
        fetcher.submit(formData, {
          method: "post",
          ...(multipart ? { encType: "multipart/form-data" as const } : {}),
        });
      }),
    [fetcher],
  );

  return { submit, isSubmitting: fetcher.state !== "idle" };
}
