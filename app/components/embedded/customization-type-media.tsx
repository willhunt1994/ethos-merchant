import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "../../styles/embedded-app.module.css";

type PreviewLayout = {
  top: number;
  left: number;
  width: number;
};

function layoutPreview(media: DOMRect): PreviewLayout {
  const width = Math.min(
    512,
    Math.max(media.width * 2.4, 300),
    window.innerWidth - 32,
  );
  const heightEstimate = Math.min(320, window.innerHeight * 0.52);
  let left = media.left + media.width / 2 - width / 2;
  let top = media.top + media.height / 2 - heightEstimate / 2;
  left = Math.min(Math.max(16, left), window.innerWidth - width - 16);
  top = Math.min(Math.max(16, top), window.innerHeight - heightEstimate - 16);
  return { top, left, width };
}

export function CustomizationTypeMedia({
  imageSrc,
  label,
}: {
  imageSrc: string;
  label: string;
}) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<PreviewLayout | null>(null);

  const canHoverPreview = useCallback(() => {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }, []);

  const openPreview = useCallback(() => {
    if (!canHoverPreview()) return;
    const el = mediaRef.current;
    if (!el) return;
    setPreview(layoutPreview(el.getBoundingClientRect()));
  }, [canHoverPreview]);

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!preview) return;
    const dismiss = () => setPreview(null);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [preview]);

  return (
    <>
      <div
        ref={mediaRef}
        className={`${styles.customizationTypeMedia} ${
          preview ? styles.customizationTypeMediaPreviewOpen : ""
        }`}
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
      >
        <img
          src={imageSrc}
          alt={label}
          className={styles.customizationTypeImage}
          loading="lazy"
          decoding="async"
        />
      </div>
      {preview && typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.customizationTypeLightboxPortal}
              style={{
                top: preview.top,
                left: preview.left,
                width: preview.width,
              }}
              aria-hidden
            >
              <img
                src={imageSrc}
                alt=""
                className={styles.customizationTypeLightboxImage}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
