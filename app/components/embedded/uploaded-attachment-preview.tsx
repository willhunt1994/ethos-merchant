import { useEffect, useState } from "react";
import type { ClientProductAttachment } from "../../lib/attachments.server";
import { extensionFromFilename } from "../../lib/upload-constants";
import { renderPdfPageDataUrls } from "../../lib/pdf-preview.client";
import styles from "../../styles/embedded-app.module.css";

type UploadedAttachmentPreviewProps = {
  attachment: ClientProductAttachment;
  cachedPreviewUrl?: string | null;
};

function isPdfAttachment(attachment: ClientProductAttachment): boolean {
  if (attachment.contentType === "application/pdf") return true;
  return extensionFromFilename(attachment.filename) === "pdf";
}

function isImageAttachment(attachment: ClientProductAttachment): boolean {
  return attachment.contentType.startsWith("image/");
}

function isLocalPreviewStorageKey(storageKey: string): boolean {
  return storageKey.startsWith("local-preview://");
}

async function previewFromBlob(
  blob: Blob,
  attachment: ClientProductAttachment,
): Promise<string | null> {
  if (isImageAttachment(attachment)) {
    return URL.createObjectURL(blob);
  }
  if (!isPdfAttachment(attachment)) {
    return null;
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  const urls = await renderPdfPageDataUrls(data, { maxWidth: 240, maxPages: 1 });
  return urls[0] ?? null;
}

export function UploadedAttachmentPreview({
  attachment,
  cachedPreviewUrl,
}: UploadedAttachmentPreviewProps) {
  const [fetchedPreviewUrl, setFetchedPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const previewUrl = cachedPreviewUrl ?? fetchedPreviewUrl;

  useEffect(() => {
    if (cachedPreviewUrl) {
      return;
    }

    let cancelled = false;
    let objectUrlToRevoke: string | null = null;
    const fileUrl = `/app/attachments/${attachment.id}`;

    const load = async () => {
      const cache = await import("../../lib/attachment-preview-cache.client");

      const sessionPreview = cache.readCachedAttachmentPreviewImage(attachment.id);
      if (sessionPreview) {
        if (!cancelled) {
          setFetchedPreviewUrl(sessionPreview);
          setFailed(false);
        }
        return;
      }

      const applyPreview = (url: string | null, fromPdfRender: boolean) => {
        if (cancelled) return;
        if (url && fromPdfRender) {
          cache.writeCachedAttachmentPreviewImage(attachment.id, url);
        }
        setFetchedPreviewUrl(url);
        setFailed(!url);
      };

      try {
        if (isLocalPreviewStorageKey(attachment.storageKey)) {
          const blob = await cache.getCachedAttachmentBlob(attachment.id);
          if (!blob) {
            applyPreview(null, false);
            return;
          }
          const url = await previewFromBlob(blob, attachment);
          if (url && isImageAttachment(attachment)) {
            objectUrlToRevoke = url;
          }
          applyPreview(url, Boolean(url && isPdfAttachment(attachment)));
          return;
        }

        if (isImageAttachment(attachment)) {
          applyPreview(fileUrl, false);
          return;
        }

        if (!isPdfAttachment(attachment)) {
          applyPreview(null, false);
          return;
        }

        const response = await fetch(fileUrl, { credentials: "same-origin" });
        if (!response.ok) {
          throw new Error("Could not load file");
        }
        const data = new Uint8Array(await response.arrayBuffer());
        const urls = await renderPdfPageDataUrls(data, { maxWidth: 240, maxPages: 1 });
        applyPreview(urls[0] ?? null, true);
      } catch {
        try {
          const blob = await cache.getCachedAttachmentBlob(attachment.id);
          if (blob && !cancelled) {
            const url = await previewFromBlob(blob, attachment);
            if (url && isImageAttachment(attachment)) {
              objectUrlToRevoke = url;
            }
            applyPreview(url, Boolean(url && isPdfAttachment(attachment)));
            return;
          }
        } catch {
          /* fall through */
        }
        if (!cancelled) {
          setFetchedPreviewUrl(null);
          setFailed(true);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [attachment, cachedPreviewUrl]);

  if (previewUrl) {
    return (
      <div className={styles.uploadedFilePreviewInteractive}>
        <div className={styles.uploadedFilePreviewThumb}>
          <img
            src={previewUrl}
            alt=""
            className={styles.uploadedFilePreviewImage}
          />
        </div>
        <div className={styles.uploadedFilePreviewLightbox} aria-hidden>
          <img src={previewUrl} alt="" className={styles.uploadedFilePreviewLightboxImage} />
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className={styles.uploadedFileDocPlaceholder} aria-hidden>
        {extensionFromFilename(attachment.filename).toUpperCase().slice(0, 3) || "DOC"}
      </div>
    );
  }

  return <div className={styles.uploadedFilePreviewLoading}>…</div>;
}
