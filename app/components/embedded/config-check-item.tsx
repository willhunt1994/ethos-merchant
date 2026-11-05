import type { ReactNode } from "react";
import styles from "../../styles/embedded-app.module.css";

function ConfigStatusIcon({ done }: { done: boolean }) {
  return (
    <span
      className={done ? styles.configStatusIconDone : styles.configStatusIconPending}
      aria-hidden
    >
      {done ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.8"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

export function ConfigStatusRow({
  done,
  label,
  detail,
  children,
}: {
  done: boolean;
  label: string;
  detail?: string | null;
  children?: ReactNode;
}) {
  return (
    <div className={styles.configStatusRow}>
      <div className={styles.configStatusHead}>
        <ConfigStatusIcon done={done} />
        <span className={styles.configStatusLabel}>{label}</span>
        {detail ? <span className={styles.configStatusDetail}>{detail}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function ConfigOptionTag({
  children,
  tone = "neutral",
  multiline = false,
  id,
}: {
  children: ReactNode;
  tone?: "neutral" | "done" | "pending" | "warning";
  multiline?: boolean;
  id?: string;
}) {
  const toneClass =
    tone === "done"
      ? styles.configOptionTagDone
      : tone === "pending"
        ? styles.configOptionTagPending
        : tone === "warning"
          ? styles.configOptionTagWarning
          : styles.configOptionTagNeutral;
  return (
    <span
      id={id}
      className={`${styles.configOptionTag} ${toneClass} ${multiline ? styles.configOptionTagMultiline : ""}`}
    >
      {children}
    </span>
  );
}

/** @deprecated Use ConfigStatusRow — kept for any legacy imports */
export function ConfigCheckItem({ done, label }: { done: boolean; label: string }) {
  return <ConfigStatusRow done={done} label={label} />;
}
