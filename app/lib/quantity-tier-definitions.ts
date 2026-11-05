export type QuantityTierDefinition = {
  minQty: number;
  maxQty: number;
  label: string;
};

export const MIN_QUANTITY_TIER_COUNT = 2;
export const MAX_QUANTITY_TIER_COUNT = 10;

/** Ethos standard quantity breaks (shop default when unset). */
export const DEFAULT_QUANTITY_BREAK_TIERS: QuantityTierDefinition[] = [
  { minQty: 1, maxQty: 24, label: "1–24 pcs" },
  { minQty: 25, maxQty: 49, label: "25–49 pcs" },
  { minQty: 50, maxQty: 99, label: "50–99 pcs" },
  { minQty: 100, maxQty: 249, label: "100–249 pcs" },
  { minQty: 250, maxQty: 999, label: "250+ pcs" },
];

/** @deprecated Use DEFAULT_QUANTITY_BREAK_TIERS */
export const MERCHANT_QUANTITY_PRICE_TIERS = DEFAULT_QUANTITY_BREAK_TIERS;

export function formatQuantityTierLabel(minQty: number, maxQty: number): string {
  return `${minQty}–${maxQty} pcs`;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }
  return null;
}

export type ParseQuantityBreakTiersResult =
  | { ok: true; tiers: QuantityTierDefinition[] }
  | { ok: false; error: string };

/** Validate and normalize shop tier definitions (sorted, contiguous). */
export function parseAndValidateQuantityBreakTiers(raw: unknown): ParseQuantityBreakTiersResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Quantity tiers must be a list." };
  }
  if (raw.length < MIN_QUANTITY_TIER_COUNT || raw.length > MAX_QUANTITY_TIER_COUNT) {
    return {
      ok: false,
      error: `Use between ${MIN_QUANTITY_TIER_COUNT} and ${MAX_QUANTITY_TIER_COUNT} quantity tiers.`,
    };
  }

  const parsed: { minQty: number; maxQty: number }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `Tier ${i + 1} is invalid.` };
    }
    const minQty = parsePositiveInt((row as { minQty?: unknown }).minQty);
    const maxQty = parsePositiveInt((row as { maxQty?: unknown }).maxQty);
    if (minQty == null || maxQty == null) {
      return { ok: false, error: `Tier ${i + 1}: min and max must be whole numbers ≥ 1.` };
    }
    if (maxQty < minQty) {
      return { ok: false, error: `Tier ${i + 1}: max must be ≥ min.` };
    }
    parsed.push({ minQty, maxQty });
  }

  parsed.sort((a, b) => a.minQty - b.minQty);

  for (let i = 0; i < parsed.length; i++) {
    const tier = parsed[i]!;
    if (i > 0) {
      const prev = parsed[i - 1]!;
      if (tier.minQty !== prev.maxQty + 1) {
        return {
          ok: false,
          error: "Tiers must be contiguous (each tier starts where the previous ends + 1).",
        };
      }
    }
  }

  const tiers: QuantityTierDefinition[] = parsed.map((t) => ({
    minQty: t.minQty,
    maxQty: t.maxQty,
    label: formatQuantityTierLabel(t.minQty, t.maxQty),
  }));

  return { ok: true, tiers };
}

export function quantityTierKey(minQty: number, maxQty: number): string {
  return `${minQty}:${maxQty}`;
}

/** Per-product: Ethos standard columns vs shop-defined breaks from Settings. */
export function quantityBreakTiersForProduct(
  useCustomQuantityBreaks: boolean,
  shopTiers: QuantityTierDefinition[],
): QuantityTierDefinition[] {
  return useCustomQuantityBreaks ? shopTiers : [...DEFAULT_QUANTITY_BREAK_TIERS];
}
