import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import styles from "../../styles/embedded-app.module.css";
import { PLACEHOLDER_IMAGE } from "../../lib/catalog-product";
import {
  customProductStatusLabel,
  type CustomProductStatus,
  type MockCustomProduct,
} from "../../lib/mock-custom-products";

const GALLERY_PLACEHOLDERS = [
  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png",
  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-3_large.png",
  "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-4_large.png",
];

type CustomProductDetailDrawerProps = {
  product: MockCustomProduct | null;
  open: boolean;
  onClose: () => void;
};

function statusTagClass(status: CustomProductStatus): string {
  switch (status) {
    case "active":
      return styles.attachmentStatusTagSuccess;
    case "draft":
      return styles.attachmentStatusTagWarning;
    case "archived":
      return styles.attachmentStatusTagNeutral;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(iso));
}

function formatMonthDay(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(iso),
  );
}

function formatCurrencyUsd(raw: string): string {
  return `$${raw}`;
}

function galleryForProduct(product: MockCustomProduct): string[] {
  const primary = product.imageUrl || PLACEHOLDER_IMAGE;
  const extras = GALLERY_PLACEHOLDERS.filter((url) => url !== primary);
  return [primary, ...extras].slice(0, 4);
}

type CustomProductDetailDrawerPanelProps = {
  product: MockCustomProduct;
  titleId: string;
  onClose: () => void;
};

function CustomProductDetailDrawerPanel({
  product,
  titleId,
  onClose,
}: CustomProductDetailDrawerPanelProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [entered, setEntered] = useState(false);

  const slides = galleryForProduct(product);
  const slideCount = slides.length;

  const goPrev = useCallback(() => {
    if (slideCount <= 1) return;
    setSlideIndex((i) => (i - 1 + slideCount) % slideCount);
  }, [slideCount]);

  const goNext = useCallback(() => {
    if (slideCount <= 1) return;
    setSlideIndex((i) => (i + 1) % slideCount);
  }, [slideCount]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      className={styles.customProductDrawerOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className={`${styles.customProductDrawer} ${
          entered ? styles.customProductDrawerEntered : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.customProductDrawerHeader}>
          <h2 id={titleId} className={styles.customProductDrawerTitle}>
            {product.title}
          </h2>
          <button
            type="button"
            className={styles.customProductDrawerClose}
            onClick={onClose}
            aria-label="Close product details"
          >
            ×
          </button>
        </header>

        <div className={styles.customProductDrawerGallery}>
          <img
            src={slides[slideIndex]}
            alt=""
            className={styles.customProductDrawerGalleryImage}
          />
          {slideCount > 1 ? (
            <>
              <button
                type="button"
                className={`${styles.customProductDrawerGalleryNav} ${styles.customProductDrawerGalleryNavPrev}`}
                onClick={goPrev}
                aria-label="Previous image"
              >
                ‹
              </button>
              <button
                type="button"
                className={`${styles.customProductDrawerGalleryNav} ${styles.customProductDrawerGalleryNavNext}`}
                onClick={goNext}
                aria-label="Next image"
              >
                ›
              </button>
              <div className={styles.customProductDrawerGalleryDots} role="tablist" aria-label="Gallery">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    role="tab"
                    className={`${styles.customProductDrawerGalleryDot} ${
                      index === slideIndex ? styles.customProductDrawerGalleryDotActive : ""
                    }`}
                    aria-selected={index === slideIndex}
                    aria-label={`Image ${index + 1} of ${slideCount}`}
                    onClick={() => setSlideIndex(index)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className={styles.customProductDrawerBody}>
          <div className={styles.customProductDrawerMetaRow}>
            <span className={statusTagClass(product.status)}>
              {customProductStatusLabel(product.status)}
            </span>
            <span className={styles.productMeta}>SKU {product.ethosSku}</span>
          </div>
          <p className={styles.customProductDrawerSubline}>
            Customized from: {product.baseProductTitle}
          </p>
          <p className={styles.productMeta}>Designed on {formatDate(product.firstListedAt)}</p>

          <h3 className={styles.customProductDrawerSectionTitle}>Sales & Activity</h3>
          <ul className={styles.customProductDrawerMetrics}>
            <li className={styles.productMetaRow}>
              <span className={styles.productMetaKey}>Units Sold</span>
              <span className={styles.productMetaValue}>
                {product.unitsPurchased.toLocaleString()}
              </span>
            </li>
            <li className={styles.productMetaRow}>
              <span className={styles.productMetaKey}>Orders</span>
              <span className={styles.productMetaValue}>{product.orderCount.toLocaleString()}</span>
            </li>
            <li className={styles.productMetaRow}>
              <span className={styles.productMetaKey}>Total Sales</span>
              <span className={styles.productMetaValue}>
                {formatCurrencyUsd(product.totalSalesUsd)}
              </span>
            </li>
            <li className={styles.productMetaRow}>
              <span className={styles.productMetaKey}>Your Share</span>
              <span className={styles.productMetaValue}>
                {formatCurrencyUsd(product.vendorShareUsd)}
              </span>
            </li>
            <li className={styles.productMetaRow}>
              <span className={styles.productMetaKey}>Last Purchase</span>
              <span className={styles.productMetaValue}>
                {formatMonthDay(product.lastPurchasedAt)}
              </span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export function CustomProductDetailDrawer({
  product,
  open,
  onClose,
}: CustomProductDetailDrawerProps) {
  const titleId = useId();

  if (!open || !product || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <CustomProductDetailDrawerPanel
      key={product.id}
      product={product}
      titleId={titleId}
      onClose={onClose}
    />,
    document.body,
  );
}