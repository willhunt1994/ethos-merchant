import { Form, useNavigation } from "react-router";
import styles from "../../styles/embedded-app.module.css";
import type { PayoutReadiness } from "../../lib/stripe/payout-gate.server";

type PayoutSettingsPanelProps = {
  payout: PayoutReadiness;
  canManage: boolean;
  previewMode: boolean;
};

export function PayoutSettingsPanel({ payout, canManage, previewMode }: PayoutSettingsPanelProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const requirements =
    payout.requirementsDue &&
    (payout.requirementsDue.currentlyDue.length > 0 ||
      payout.requirementsDue.pastDue.length > 0);

  return (
    <section className={styles.settingsPanel} aria-labelledby="settings-payout-heading">
      <h2 id="settings-payout-heading" className={styles.settingsPanelTitle}>
        Payout Bank Account
      </h2>
      <p className={`${styles.settingsHelpText} ${styles.settingsIntroText}`}>
        Connect a US bank account through Stripe so Ethos can send payouts when your supplier account
        is active. Bank details are collected securely by Stripe—we never store account numbers.
      </p>

      {!payout.configured && !previewMode ? (
        <p className={styles.settingsHelpText} role="status">
          Payout setup is not available yet. Contact Ethos if you need to connect a bank account.
        </p>
      ) : null}

      <ul className={styles.settingsDetailList}>
        <li className={styles.settingsDetailRow}>
          <span className={styles.settingsDetailKey}>Status</span>
          <span className={styles.settingsDetailValue}>{payout.statusLabel}</span>
        </li>
        {payout.syncedAt ? (
          <li className={styles.settingsDetailRow}>
            <span className={styles.settingsDetailKey}>Last synced</span>
            <span className={styles.settingsDetailValue}>
              {new Date(payout.syncedAt).toLocaleString()}
            </span>
          </li>
        ) : null}
      </ul>

      {payout.statusLabel === "Paused by Ethos" ? (
        <p className={styles.settingsHelpText}>
          Your bank account is connected, but Ethos has not enabled payouts for this store yet. Your
          representative can turn this on after review.
        </p>
      ) : null}

      {!payout.w9Complete ? (
        <p className={styles.settingsHelpText}>
          We recommend completing your W-9 above first so your legal business name and address can
          prefill Stripe onboarding.
        </p>
      ) : null}

      {!payout.vendorAgreementExecuted ? (
        <p className={styles.settingsHelpText}>
          Payout bank connection requires a fully executed vendor agreement (your signature,
          Schedule A, and Ethos countersignature).
        </p>
      ) : null}

      {requirements && payout.requirementsDue ? (
        <div className={styles.settingsHelpText}>
          <p>Stripe needs additional information before payouts can go live:</p>
          <ul style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
            {[
              ...payout.requirementsDue.pastDue,
              ...payout.requirementsDue.currentlyDue,
            ]
              .slice(0, 8)
              .map((item) => (
                <li key={item}>{item.replace(/_/g, " ")}</li>
              ))}
          </ul>
        </div>
      ) : null}

      {previewMode ? (
        <p className={styles.settingsHelpText}>
          Local preview: payout actions are simulated. Connect bank in a real embedded session.
        </p>
      ) : null}

      <div className={styles.settingsActions}>
        {canManage && payout.configured ? (
          <>
            <Form method="post">
              <input type="hidden" name="intent" value="start-payout-onboarding" />
              <button
                type="submit"
                className={styles.primarySubmitButton}
                disabled={busy || !payout.vendorAgreementExecuted}
              >
                {payout.stripeConnectAccountId ? "Update Bank Details" : "Connect Bank Account"}
              </button>
            </Form>
            <Form method="post">
              <input type="hidden" name="intent" value="refresh-payout-status" />
              <button type="submit" className={styles.settingsButton} disabled={busy}>
                Refresh Status
              </button>
            </Form>
          </>
        ) : !canManage && payout.configured ? (
          <p className={styles.settingsHelpText}>
            Only the store owner can connect or update the payout bank account.
          </p>
        ) : null}
      </div>
    </section>
  );
}
