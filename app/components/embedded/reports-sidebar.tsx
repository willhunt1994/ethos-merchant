import { Link } from "react-router";
import styles from "../../styles/embedded-app.module.css";

export const REPORTS_SECTIONS = [
  { id: "custom-products", label: "Custom Products", href: "/app/custom-products" },
] as const;

export type ReportsSectionId = (typeof REPORTS_SECTIONS)[number]["id"];

type ReportsSidebarProps = {
  activeSection: ReportsSectionId;
};

export function ReportsSidebar({ activeSection }: ReportsSidebarProps) {
  return (
    <nav className={styles.settingsNav} aria-label="Reports sections">
      <p className={styles.settingsNavGroupLabel}>Reports</p>
      {REPORTS_SECTIONS.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <Link
            key={item.id}
            to={item.href}
            className={`${styles.settingsNavItem} ${isActive ? styles.settingsNavItemActive : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}