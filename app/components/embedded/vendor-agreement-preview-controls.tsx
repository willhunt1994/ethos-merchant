import { useSearchParams } from "react-router";
import styles from "../../styles/embedded-app.module.css";
import {
  PREVIEW_VENDOR_EXECUTED_PARAM,
  PREVIEW_VENDOR_SIGNED_PARAM,
} from "../../lib/vendor-agreement-preview-mock";

type PreviewScenario = "unsigned" | "signed" | "executed";

export function VendorAgreementPreviewControls({
  mockSigned,
  mockFullyExecuted,
}: {
  mockSigned: boolean;
  mockFullyExecuted: boolean;
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const active: PreviewScenario = mockFullyExecuted
    ? "executed"
    : mockSigned
      ? "signed"
      : "unsigned";

  function applyScenario(scenario: PreviewScenario) {
    const next = new URLSearchParams(searchParams);
    next.set("section", "vendor-agreement");
    if (scenario === "unsigned") {
      next.delete(PREVIEW_VENDOR_SIGNED_PARAM);
      next.delete(PREVIEW_VENDOR_EXECUTED_PARAM);
    } else if (scenario === "signed") {
      next.set(PREVIEW_VENDOR_SIGNED_PARAM, "1");
      next.delete(PREVIEW_VENDOR_EXECUTED_PARAM);
    } else {
      next.set(PREVIEW_VENDOR_SIGNED_PARAM, "1");
      next.set(PREVIEW_VENDOR_EXECUTED_PARAM, "1");
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <div className={styles.vendorAgreementPreviewBar} role="region" aria-label="Preview demo state">
      <p className={styles.vendorAgreementPreviewBarLabel}>
        Local preview — demo agreement status (not saved to the database)
      </p>
      <div className={styles.vendorAgreementPreviewBarActions}>
        <button
          type="button"
          className={`${styles.settingsButton} ${
            active === "unsigned" ? styles.vendorAgreementPreviewActive : ""
          }`}
          aria-pressed={active === "unsigned"}
          onClick={() => applyScenario("unsigned")}
        >
          Not Signed
        </button>
        <button
          type="button"
          className={`${styles.settingsButton} ${
            active === "signed" ? styles.vendorAgreementPreviewActive : ""
          }`}
          aria-pressed={active === "signed"}
          onClick={() => applyScenario("signed")}
        >
          Signed (Awaiting Ethos)
        </button>
        <button
          type="button"
          className={`${styles.settingsButton} ${
            active === "executed" ? styles.vendorAgreementPreviewActive : ""
          }`}
          aria-pressed={active === "executed"}
          onClick={() => applyScenario("executed")}
        >
          Fully Executed
        </button>
      </div>
    </div>
  );
}
