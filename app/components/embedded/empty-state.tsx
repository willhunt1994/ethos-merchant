import type { ReactNode } from "react";
import styles from "../../styles/embedded-app.module.css";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.emptyBlock}>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyText}>{description}</p>
      {action ?? null}
    </div>
  );
}
