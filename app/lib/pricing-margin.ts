/** Gross profit per unit (Ethos sell price minus Shopify unit cost). */
export function grossMarginDollars(sellPrice: number, unitCost: number): number {
  return sellPrice - unitCost;
}

/** Gross margin % on sell price — matches Ethos Employee catalog math. */
export function grossMarginPercent(sellPrice: number, unitCost: number): number | null {
  if (sellPrice <= 0) return null;
  return ((sellPrice - unitCost) / sellPrice) * 100;
}

function parseMoneyAmount(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return null;
  const n = Number(trimmed.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatSignedUsd(amount: number): string {
  if (amount > 0) return `+${formatUsd(amount)}`;
  if (amount < 0) return `-${formatUsd(Math.abs(amount))}`;
  return formatUsd(0);
}

function formatMarginPercent(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

function parsePercentToken(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/%/g, "").replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSignedDollarToken(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const negative = /^-/.test(trimmed) || /-\$/.test(trimmed);
  const positive = /^\+/.test(trimmed) || /\+\$/.test(trimmed);
  const n = Number(trimmed.replace(/[^0-9.]+/g, ""));
  if (!Number.isFinite(n)) return null;
  if (negative && n !== 0) return -n;
  if (positive) return n;
  return n;
}

export type MarginEditMode = "percent" | "profit";

/** Tier sell price for a target gross margin % on sell price. */
export function sellPriceFromTargetMarginPercent(
  unitCost: number,
  marginPercent: number,
): number | null {
  if (!Number.isFinite(unitCost) || unitCost < 0) return null;
  if (!Number.isFinite(marginPercent)) return null;
  if (marginPercent >= 100) return null;
  const denom = 1 - marginPercent / 100;
  if (Math.abs(denom) < 1e-9) return null;
  const sell = unitCost / denom;
  if (!Number.isFinite(sell) || sell < 0) return null;
  return sell;
}

export function sellPriceFromTargetProfit(unitCost: number, profitDollars: number): number | null {
  if (!Number.isFinite(unitCost) || unitCost < 0) return null;
  if (!Number.isFinite(profitDollars)) return null;
  const sell = unitCost + profitDollars;
  if (!Number.isFinite(sell) || sell < 0) return null;
  return sell;
}

export function formatTierPriceFromMargin(amount: number): string {
  return amount.toFixed(2);
}

export function tierPriceStringFromTargetMarginPercent(
  shopifyUnitCost: string,
  marginPercent: number,
): string | null {
  return tierPriceStringFromMarginEdit(shopifyUnitCost, `${marginPercent}%`, null);
}

/** Parse a margin-only edit field (e.g. `25`, `-12.5`, `25%`). */
export function parseMarginPercentInput(raw: string): number | null {
  return parsePercentToken(raw);
}

/**
 * Parse margin row edit text (compact display or margin % / profit $ only).
 * When both profit and % appear, prefers the field that changed vs baseline.
 */
export function tierPriceStringFromMarginEdit(
  shopifyUnitCost: string,
  editText: string,
  baseline: { profitDollars: number; marginPercent: number | null } | null,
): string | null {
  const unitCost = parseMoneyAmount(shopifyUnitCost);
  if (unitCost == null) return null;

  const trimmed = editText.trim();
  if (!trimmed) return null;

  const resolve = (mode: MarginEditMode, value: number): string | null => {
    const sell =
      mode === "percent"
        ? sellPriceFromTargetMarginPercent(unitCost, value)
        : sellPriceFromTargetProfit(unitCost, value);
    return sell == null ? null : formatTierPriceFromMargin(sell);
  };

  if (trimmed.includes("·")) {
    const [left, right] = trimmed.split("·").map((s) => s.trim());
    const profit = parseSignedDollarToken(left);
    const marginPercent = parsePercentToken(right);
    const baseProfit = baseline?.profitDollars;
    const baseMargin = baseline?.marginPercent;

    const profitChanged =
      profit != null &&
      baseProfit != null &&
      Math.abs(profit - baseProfit) > 0.004;
    const marginChanged =
      marginPercent != null &&
      baseMargin != null &&
      Math.abs(marginPercent - baseMargin) > 0.04;

    if (marginChanged && !profitChanged && marginPercent != null) {
      return resolve("percent", marginPercent);
    }
    if (profitChanged && !marginChanged && profit != null) {
      return resolve("profit", profit);
    }
    if (marginPercent != null) return resolve("percent", marginPercent);
    if (profit != null) return resolve("profit", profit);
    return null;
  }

  if (trimmed.includes("%")) {
    const marginPercent = parsePercentToken(trimmed);
    return marginPercent == null ? null : resolve("percent", marginPercent);
  }

  if (/[$]/.test(trimmed) || /^[+-]/.test(trimmed)) {
    const profit = parseSignedDollarToken(trimmed);
    return profit == null ? null : resolve("profit", profit);
  }

  const lone = Number(trimmed.replace(/[^0-9.-]+/g, ""));
  if (!Number.isFinite(lone)) return null;
  return resolve("percent", lone);
}

export type EthosCostMarginParts = {
  profitDollars: number;
  marginPercent: number | null;
  profitLabel: string;
  marginPercentLabel: string;
  tone: "positive" | "negative" | "neutral";
};

/** Red (loss) → green (profit) based on gross margin % vs unit cost. */
export function marginSpectrumStyle(parts: EthosCostMarginParts): {
  color: string;
  backgroundColor: string;
} {
  let marginPercent = parts.marginPercent;
  if (marginPercent == null) {
    marginPercent = parts.profitDollars < 0 ? -40 : parts.profitDollars > 0 ? 40 : 0;
  }
  const clamped = Math.max(-100, Math.min(100, marginPercent));
  const t = (clamped + 100) / 200;
  const hue = t * 120;
  const saturation = 52 + (Math.abs(clamped) / 100) * 28;
  const lightness = 26 + (1 - Math.abs(clamped) / 100) * 10;
  return {
    color: `hsl(${hue} ${saturation}% ${lightness}%)`,
    backgroundColor: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.1)`,
  };
}

export function ethosCostMarginParts(
  shopifyUnitCost: string,
  ethosPrice: string | null,
): EthosCostMarginParts | null {
  const unitCost = parseMoneyAmount(shopifyUnitCost);
  const sellPrice = parseMoneyAmount(ethosPrice);
  if (unitCost == null || sellPrice == null) return null;

  const profitDollars = grossMarginDollars(sellPrice, unitCost);
  const marginPercent = grossMarginPercent(sellPrice, unitCost);
  const tone =
    profitDollars > 0 ? "positive" : profitDollars < 0 ? "negative" : "neutral";

  return {
    profitDollars,
    marginPercent,
    profitLabel: formatSignedUsd(profitDollars),
    marginPercentLabel: marginPercent == null ? "—" : formatMarginPercent(marginPercent),
    tone,
  };
}

/** Short hover text for quantity tier margin cells. */
export function ethosCostMarginTooltip(
  shopifyUnitCost: string,
  tierPrice: string | null,
): string | undefined {
  const unitCost = parseMoneyAmount(shopifyUnitCost);
  const sellPrice = parseMoneyAmount(tierPrice);
  if (unitCost == null || sellPrice == null) return undefined;

  return (
    `Per unit: tier price (${formatUsd(sellPrice)}) minus Shopify cost (${formatUsd(unitCost)}). ` +
    "The dollar amount is profit or loss; the percentage is margin on the tier price. " +
    "Red is below cost, green is above cost."
  );
}

/** Display string for configure table: signed dollars and gross margin % on Ethos price. */
export function formatEthosCostMarginDisplay(
  shopifyUnitCost: string,
  ethosPrice: string | null,
): string {
  const parts = ethosCostMarginParts(shopifyUnitCost, ethosPrice);
  if (!parts) return "—";
  if (parts.marginPercent == null) return parts.profitLabel;
  return `${parts.profitLabel} · ${parts.marginPercentLabel}`;
}
