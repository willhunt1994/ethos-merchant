import { useCallback, useEffect, useRef, useState } from "react";
import { PdfDropzonePreview } from "./pdf-dropzone-preview";
import {
  CONTACT_ATTACHMENT_ACCEPT,
  MAX_CONTACT_ATTACHMENT_BYTES,
  contactAttachmentPreviewKind,
  extensionFromFilename,
  isAllowedContactAttachment,
} from "../../lib/upload-constants";
import styles from "../../styles/embedded-app.module.css";

type ContactAttachmentFieldProps = {
  disabled?: boolean;
  onError?: (message: string | null) => void;
};

export function ContactAttachmentField({ disabled, onError }: ContactAttachmentFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const assignFile = useCallback(
    (file: File | null) => {
      onError?.(null);
      if (!file) {
        setPendingFile(null);
        setPendingPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      if (!isAllowedContactAttachment(file.name, file.type || "application/octet-stream")) {
        onError?.("Use PNG, JPG, WEBP, GIF, SVG, PDF, AI, EPS, or DOCX.");
        return;
      }
      if (file.size > MAX_CONTACT_ATTACHMENT_BYTES) {
        onError?.(
          `File must be at most ${Math.round(MAX_CONTACT_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
        );
        return;
      }

      setPendingFile(file);
      setPendingPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });

      if (fileRef.current) {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileRef.current.files = dt.files;
      }
    },
    [onError],
  );

  const previewKind = pendingFile
    ? contactAttachmentPreviewKind(pendingFile.name, pendingFile.type || "")
    : null;

  return (
    <div className={styles.formField}>
      <span className={styles.formFieldLabel}>Screenshot or file (optional)</span>
      <div
        className={`${styles.dropzone} ${dropActive ? styles.dropzoneActive : ""} ${
          pendingFile ? styles.dropzoneHasFile : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) assignFile(file);
        }}
        onClick={() => {
          if (!disabled) fileRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Upload screenshot or attachment"
        aria-disabled={disabled}
      >
        <input
          ref={fileRef}
          type="file"
          name="attachment"
          accept={CONTACT_ATTACHMENT_ACCEPT}
          className={styles.dropzoneInput}
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            assignFile(file);
          }}
        />
        {pendingFile && pendingPreviewUrl ? (
          <div className={styles.dropzonePreviewStack}>
            {previewKind === "image" ? (
              <img src={pendingPreviewUrl} alt="" className={styles.dropzonePreview} />
            ) : previewKind === "pdf" ? (
              <PdfDropzonePreview file={pendingFile} />
            ) : (
              <div className={styles.dropzoneDocPreview} aria-hidden>
                {extensionFromFilename(pendingFile.name).toUpperCase()}
              </div>
            )}
            <div className={styles.dropzoneFileMeta}>
              <span className={styles.dropzoneFileName}>{pendingFile.name}</span>
              <span className={styles.dropzoneHint}>
                {Math.round(pendingFile.size / 1024)} KB · Click or drop to replace
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.dropzoneEmpty}>
            <span className={styles.dropzoneTitle}>Drag and drop a screenshot or file</span>
            <span className={styles.dropzoneHint}>
              PNG, JPG, WEBP, GIF, SVG, PDF, AI, EPS, or DOCX
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
