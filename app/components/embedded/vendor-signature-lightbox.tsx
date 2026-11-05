import { useEffect, useId, useState } from "react";
import styles from "../../styles/embedded-app.module.css";
import { isDrawnVendorSignature } from "../../lib/vendor-signature";
import { VendorSignaturePad } from "./vendor-signature-pad";

type VendorSignatureLightboxProps = {
  open: boolean;
  onClose: () => void;
  signatoryName: string;
  signatoryTitle: string;
  signatureText: string;
  onApply: (values: {
    signatoryName: string;
    signatoryTitle: string;
    signatureText: string;
  }) => void;
};

export function VendorSignatureLightbox({
  open,
  onClose,
  ...contentProps
}: VendorSignatureLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return <VendorSignatureLightboxContent open={open} onClose={onClose} {...contentProps} />;
}

function VendorSignatureLightboxContent({
  onClose,
  signatoryName,
  signatoryTitle,
  signatureText,
  onApply,
}: VendorSignatureLightboxProps) {
  const titleId = useId();
  const [draftName, setDraftName] = useState(signatoryName);
  const [draftTitle, setDraftTitle] = useState(signatoryTitle);
  const [draftSignature, setDraftSignature] = useState(signatureText);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleApply() {
    const name = draftName.trim();
    const title = draftTitle.trim();
    const signature = draftSignature.trim();
    if (!name) {
      setLocalError("Authorized signatory name is required.");
      return;
    }
    if (!title) {
      setLocalError("Title is required.");
      return;
    }
    if (!signature) {
      setLocalError("Draw your signature in the box below.");
      return;
    }
    if (!isDrawnVendorSignature(signature)) {
      setLocalError("Use the signature pad to draw your signature.");
      return;
    }
    onApply({ signatoryName: name, signatoryTitle: title, signatureText: signature });
    onClose();
  }

  return (
    <div
      className={styles.vendorSignatureOverlay}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={styles.vendorSignatureDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId} className={styles.vendorSignatureDialogTitle}>
          Sign Agreement
        </h3>
        <p className={styles.settingsHelpText}>
          Enter your name and title, then draw your signature with your trackpad or mouse.
        </p>
        <label className={styles.formField}>
          <span className={styles.formFieldLabel}>
            Authorized Signatory <span className={styles.requiredMark}>*</span>
          </span>
          <input
            type="text"
            className={styles.field}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className={styles.formField}>
          <span className={styles.formFieldLabel}>
            Title <span className={styles.requiredMark}>*</span>
          </span>
          <input
            type="text"
            className={styles.field}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            autoComplete="organization-title"
          />
        </label>
        <div className={styles.formField}>
          <span className={styles.formFieldLabel}>
            Signature <span className={styles.requiredMark}>*</span>
          </span>
          <VendorSignaturePad initialValue={signatureText} onChange={setDraftSignature} />
        </div>
        {localError ? (
          <p className={styles.formError} role="alert">
            {localError}
          </p>
        ) : null}
        <div className={styles.vendorSignatureDialogActions}>
          <button type="button" className={styles.settingsButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primarySubmitButton} onClick={handleApply}>
            Apply Signature
          </button>
        </div>
      </div>
    </div>
  );
}
