import type { CatalogProduct } from "../../lib/catalog-product";
import styles from "../../styles/embedded-app.module.css";

export type SubmissionStatus = CatalogProduct["submissionStatus"];

export function submissionStatusLabel(status: SubmissionStatus): string {
  switch (status) {
    case "imported":
    case "submitted":
      return "Submitted";
    case "needs_attention":
      return "Needs Attention";
    default:
      return "Not Submitted";
  }
}

function statusTagClass(status: SubmissionStatus): string {
  switch (status) {
    case "imported":
    case "submitted":
      return styles.attachmentStatusTagSuccess;
    case "needs_attention":
      return styles.attachmentStatusTagWarning;
    default:
      return styles.attachmentStatusTagNeutral;
  }
}

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span className={statusTagClass(status)}>{submissionStatusLabel(status)}</span>
  );
}
