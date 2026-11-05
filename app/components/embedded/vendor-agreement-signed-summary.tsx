import styles from "../../styles/embedded-app.module.css";
import type { VendorAgreementView } from "../../lib/vendor-agreement.server";
import { VENDOR_AGREEMENT_SIGNED_PDF_PATH } from "../../lib/vendor-agreement-pdf-paths";

type VendorAgreementSignedSummaryProps = {
  agreement: VendorAgreementView;
};

function formatSignedWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VendorAgreementSignedSummary({ agreement }: VendorAgreementSignedSummaryProps) {
  const executed = agreement.fullyExecuted;
  const awaitingEthos = agreement.pendingEthosCounterSign && !executed;

  return (
    <div className={styles.vendorAgreementSignedCard}>
      <div className={styles.vendorAgreementSignedCardHeader}>
        <div className={styles.vendorAgreementSignedHeaderMain}>
          <div className={styles.vendorAgreementSignedTitleRow}>
            <h3 className={styles.vendorAgreementSignedTitle}>Vendor Agreement on File</h3>
            <span
              className={
                executed
                  ? styles.vendorAgreementSignedBadgeSuccess
                  : awaitingEthos
                    ? styles.vendorAgreementSignedBadgePending
                    : styles.vendorAgreementSignedBadgeNeutral
              }
            >
              {executed ? "Fully Executed" : awaitingEthos ? "Awaiting Ethos" : "Signed"}
            </span>
          </div>
          <ul className={styles.vendorAgreementSignedMetaList}>
            <li>Signed {formatSignedWhen(agreement.signedAt)}</li>
            <li>Version {agreement.version ?? "—"}</li>
            {executed && agreement.ethosSignedAt ? (
              <li>Ethos {formatSignedWhen(agreement.ethosSignedAt)}</li>
            ) : null}
          </ul>
        </div>
        <a
          href={VENDOR_AGREEMENT_SIGNED_PDF_PATH}
          className={`${styles.settingsButton} ${styles.vendorAgreementSignedDownload}`}
          download
        >
          Download Signed PDF
        </a>
      </div>

      {awaitingEthos ? (
        <p className={styles.vendorAgreementSignedNotice} role="status">
          Ethos countersignature is required before payout bank setup can be enabled.
        </p>
      ) : null}

      {executed && agreement.ethosSignatoryName ? (
        <p className={styles.vendorAgreementSignedNoticeSuccess} role="status">
          Countersigned by {agreement.ethosSignatoryName}
          {agreement.ethosSignatoryTitle ? `, ${agreement.ethosSignatoryTitle}` : ""}.
        </p>
      ) : null}

      <div className={styles.vendorAgreementSignedDetailsPanel}>
        <h4 className={styles.vendorAgreementSignedDetailsHeading}>Registration Summary</h4>
        <dl className={styles.vendorAgreementSignedDetails}>
          <div>
            <dt>Legal Business Name</dt>
            <dd>{agreement.legalName || "—"}</dd>
          </div>
          {agreement.dba ? (
            <div>
              <dt>DBA</dt>
              <dd>{agreement.dba}</dd>
            </div>
          ) : null}
          <div>
            <dt>Entity</dt>
            <dd>
              {[agreement.entityType, agreement.entityFormation].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
          {agreement.website ? (
            <div>
              <dt>Website</dt>
              <dd>{agreement.website}</dd>
            </div>
          ) : null}
          <div className={styles.vendorAgreementSignedDetailsWide}>
            <dt>Primary Contact</dt>
            <dd className={styles.vendorAgreementSignedStacked}>
              {agreement.primaryContact ? <span>{agreement.primaryContact}</span> : null}
              {agreement.contactEmail ? (
                <span>
                  <a href={`mailto:${agreement.contactEmail}`} className={styles.settingsTextLink}>
                    {agreement.contactEmail}
                  </a>
                </span>
              ) : null}
              {agreement.contactPhone ? <span>{agreement.contactPhone}</span> : null}
              {!agreement.primaryContact && !agreement.contactEmail && !agreement.contactPhone ? (
                <span>—</span>
              ) : null}
            </dd>
          </div>
          <div className={styles.vendorAgreementSignedDetailsWide}>
            <dt>Business Address</dt>
            <dd className={styles.vendorAgreementSignedAddress}>
              {agreement.businessAddress.trim()
                ? agreement.businessAddress.split("\n").map((line) => <span key={line}>{line}</span>)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Authorized Signatory</dt>
            <dd>
              {agreement.signatoryName || "—"}
              {agreement.signatoryTitle ? (
                <span className={styles.vendorAgreementSignedMuted}> · {agreement.signatoryTitle}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Schedule A</dt>
            <dd>
              {agreement.scheduleA.termsAccepted ? (
                <span className={styles.vendorAgreementSignedAccepted}>Accepted</span>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
