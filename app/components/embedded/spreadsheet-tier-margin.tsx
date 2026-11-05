import styles from "../../styles/embedded-app.module.css";
import {
  ethosCostMarginParts,
  ethosCostMarginTooltip,
  formatEthosCostMarginDisplay,
  marginSpectrumStyle,
} from "../../lib/pricing-margin";

/** Read-only profit and margin rows under a tier price cell. */
export function SpreadsheetTierMargin({
  shopifyUnitCost,
  tierPrice,
}: {
  shopifyUnitCost: string;
  tierPrice: string | null;
}) {
  const parts = ethosCostMarginParts(shopifyUnitCost, tierPrice);
  if (!parts) {
    return (
      <div className={styles.spreadsheetCellMarginBlock} aria-hidden>
        <span className={styles.spreadsheetCellMarginEmpty}>—</span>
      </div>
    );
  }

  const spectrum = marginSpectrumStyle(parts);
  const tooltip = ethosCostMarginTooltip(shopifyUnitCost, tierPrice);

  return (
    <div
      className={styles.spreadsheetCellMarginBlock}
      style={{ color: spectrum.color, backgroundColor: spectrum.backgroundColor }}
      title={tooltip}
    >
      <div className={styles.spreadsheetCellMarginStatRow}>
        <span className={styles.spreadsheetCellMarginStatLabel}>Profit</span>
        <span className={styles.spreadsheetCellMarginStatValue}>{parts.profitLabel}</span>
      </div>
      <div className={styles.spreadsheetCellMarginStatRow}>
        <span className={styles.spreadsheetCellMarginStatLabel}>Margin</span>
        <span className={styles.spreadsheetCellMarginStatValue}>
          {parts.marginPercentLabel}
        </span>
      </div>
    </div>
  );
}

/** Compact margin cell for the per-variant pricing table (same spectrum as tier cells). */
export function VariantTableMargin({
  shopifyUnitCost,
  ethosPrice,
}: {
  shopifyUnitCost: string;
  ethosPrice: string | null;
}) {
  const parts = ethosCostMarginParts(shopifyUnitCost, ethosPrice);
  if (!parts) {
    return <span className={styles.marginCellEmpty}>—</span>;
  }

  const spectrum = marginSpectrumStyle(parts);
  const tooltip = ethosCostMarginTooltip(shopifyUnitCost, ethosPrice);

  return (
    <span
      className={styles.marginCellBadge}
      style={{ color: spectrum.color, backgroundColor: spectrum.backgroundColor }}
      title={tooltip}
    >
      {formatEthosCostMarginDisplay(shopifyUnitCost, ethosPrice)}
    </span>
  );
}
