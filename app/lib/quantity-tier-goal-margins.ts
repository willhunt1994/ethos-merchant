import { tierPriceStringFromTargetMarginPercent } from "./pricing-margin";

/** Suggested gross margin % on tier price, aligned with {@link DEFAULT_QUANTITY_BREAK_TIERS}. */
export const DEFAULT_SUGGESTED_GROSS_MARGIN_PERCENTS = [50, 45, 42, 39, 35] as const;

export function defaultGoalMarginPercentsForTierCount(tierCount: number): number[] {
  return Array.from({ length: tierCount }, (_, index) => {
    if (index < DEFAULT_SUGGESTED_GROSS_MARGIN_PERCENTS.length) {
      return DEFAULT_SUGGESTED_GROSS_MARGIN_PERCENTS[index]!;
    }
    const last = DEFAULT_SUGGESTED_GROSS_MARGIN_PERCENTS.at(-1) ?? 35;
    const stepsPast = index - DEFAULT_SUGGESTED_GROSS_MARGIN_PERCENTS.length + 1;
    return Math.max(0, last - stepsPast * 3);
  });
}

export function parseGoalMarginPercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/%/g, ""));
  if (!Number.isFinite(n)) return null;
  if (n >= 100) return null;
  return Math.round(n * 10) / 10;
}

export function suggestedTierPricesForVariant(
  shopifyUnitCost: string,
  goalMarginPercents: number[],
): string[] {
  return goalMarginPercents.map((marginPercent) => {
    return tierPriceStringFromTargetMarginPercent(shopifyUnitCost, marginPercent) ?? "";
  });
}
