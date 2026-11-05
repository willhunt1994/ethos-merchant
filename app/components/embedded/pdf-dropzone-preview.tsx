import { useEffect, useRef, useState } from "react";
import { renderPdfPageDataUrls } from "../../lib/pdf-preview.client";
import styles from "../../styles/embedded-app.module.css";

type PdfDropzonePreviewProps = {
  file: File;
};

export function PdfDropzonePreview({ file }: PdfDropzonePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      setLoading(true);
      setError(null);
      setPageUrls([]);

      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const containerWidth = containerRef.current?.clientWidth ?? 880;
        const urls = await renderPdfPageDataUrls(data, {
          maxWidth: Math.max(320, containerWidth - 2),
        });

        if (!cancelled) {
          setPageUrls(urls);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not preview PDF");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void render();

    return () => {
      cancelled = true;
    };
  }, [file]);

  return (
    <div ref={containerRef} className={styles.dropzonePdfPages}>
      {loading ? <p className={styles.dropzoneHint}>Loading preview…</p> : null}
      {error ? <p className={styles.formError}>{error}</p> : null}
      {pageUrls.map((url, index) => (
        <img
          key={`${file.name}-page-${index + 1}`}
          src={url}
          alt={`Page ${index + 1} of ${file.name}`}
          className={styles.dropzonePdfPageImage}
        />
      ))}
    </div>
  );
}
