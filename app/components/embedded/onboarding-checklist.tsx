import { Link } from "react-router";
import styles from "../../styles/embedded-app.module.css";
import type { OnboardingChecklist } from "../../lib/onboarding-checklist.server";

export function OnboardingChecklistPanel({ checklist }: { checklist: OnboardingChecklist }) {
  return (
    <section className={styles.onboardingChecklist} aria-labelledby="onboarding-checklist-heading">
      <div className={styles.onboardingChecklistHeader}>
        <h2 id="onboarding-checklist-heading" className={styles.sectionTitle}>
          Getting Started
        </h2>
        <p className={styles.onboardingChecklistProgress} aria-live="polite">
          {checklist.completedCount} of {checklist.totalCount} complete
        </p>
      </div>
      <ol className={styles.onboardingChecklistList}>
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className={`${styles.onboardingChecklistItem} ${
              item.complete ? styles.onboardingChecklistItemDone : ""
            }`}
          >
            <span
              className={
                item.complete
                  ? styles.onboardingChecklistIconDone
                  : styles.onboardingChecklistIconPending
              }
              aria-hidden
            >
              {item.complete ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2.5 6.2 4.8 8.5 9.5 3.8"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                item.step
              )}
            </span>
            {item.complete ? (
              <span className={styles.onboardingChecklistLabel}>{item.label}</span>
            ) : (
              <Link to={item.href} className={styles.onboardingChecklistLink}>
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
