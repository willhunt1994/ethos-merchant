/** Customer add-on charged during customization (USD). */
export const DEFAULT_CUSTOMIZATION_CUSTOMER_ADD_ON_USD = 5;

export const PRODUCT_CUSTOMIZATION_TYPES = [
  {
    id: "dtf_lomelt",
    label: "Printed Logos",
    description: "Our standard customization with clean crisp prints on all fabric types.",
    worksBestOn: "Works well on all items.",
    customerAddOnUsd: DEFAULT_CUSTOMIZATION_CUSTOMER_ADD_ON_USD,
    imageSrc: "/assets/customization-options/printed.png",
  },
  {
    id: "puff_print",
    label: "Puff Print",
    description: "Raised specialty ink for a textured, 3D look on logos and graphics.",
    worksBestOn: "Works best on fleece and thicker fabric.",
    customerAddOnUsd: 8,
    imageSrc: "/assets/customization-options/puff-print.png",
  },
  {
    id: "patches",
    label: "Patches",
    description: "Woven or embroidered patches applied by sew or heat press.",
    worksBestOn: "Works best on fleece and thicker products.",
    customerAddOnUsd: DEFAULT_CUSTOMIZATION_CUSTOMER_ADD_ON_USD,
    imageSrc: "/assets/customization-options/patch.png",
  },
  {
    id: "embroidery_flat",
    label: "Flat Embroidery",
    description: "Thread stitched flush into the fabric for a clean, classic logo finish.",
    worksBestOn: "Works well with headwear & socks.",
    customerAddOnUsd: DEFAULT_CUSTOMIZATION_CUSTOMER_ADD_ON_USD,
    imageSrc: "/assets/customization-options/flat-embroidery.png",
  },
  {
    id: "embroidery_puff",
    label: "Puff Embroidery",
    description: "Raised 3D embroidery for bold logos with extra dimension and texture.",
    worksBestOn: "Works well with headwear.",
    customerAddOnUsd: DEFAULT_CUSTOMIZATION_CUSTOMER_ADD_ON_USD,
    imageSrc: "/assets/customization-options/puff-embroidery.png",
  },
] as const;

export type ProductCustomizationTypeId = (typeof PRODUCT_CUSTOMIZATION_TYPES)[number]["id"];

export function formatCustomizationCustomerAddOnUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function variableComplexityAddOnMessage(noun: "patch" | "embroidery"): string {
  return `Ethos will add a variable pricing on top of your cost price depending on the complexity of the ${noun}.`;
}

export function customizationCustomerAddOnMessage(
  type: (typeof PRODUCT_CUSTOMIZATION_TYPES)[number],
): string {
  switch (type.id) {
    case "dtf_lomelt": {
      const amount = formatCustomizationCustomerAddOnUsd(type.customerAddOnUsd);
      return `Ethos will add ${amount} per logo for this to the customer during customization`;
    }
    case "puff_print": {
      const amount = formatCustomizationCustomerAddOnUsd(type.customerAddOnUsd);
      return `Ethos will add ${amount} per logo on top of your cost price for this customization method.`;
    }
    case "patches":
      return variableComplexityAddOnMessage("patch");
    case "embroidery_flat":
    case "embroidery_puff":
      return variableComplexityAddOnMessage("embroidery");
  }
}

export function customizationTypeWorksBestOnLines(
  type: (typeof PRODUCT_CUSTOMIZATION_TYPES)[number],
): string[] {
  if (!("worksBestOn" in type) || !type.worksBestOn) return [];
  const note = type.worksBestOn;
  if (typeof note === "string") return [note];
  return [...note];
}

/** Info lines on each card — “works best on” only (pricing lives in panel subtext). */
export function customizationTypeCardInfoLines(
  type: (typeof PRODUCT_CUSTOMIZATION_TYPES)[number],
): string[] {
  return customizationTypeWorksBestOnLines(type).filter(
    (line) => !line.trim().startsWith("Ethos will add"),
  );
}

export const CUSTOMIZATION_TYPE_SELECTION_INTRO =
  "Select which customization options you'd like to offer on this product.";

export const CUSTOMIZATION_TYPE_FEE_NOTE =
  "Ethos will add an additional fee for the customer based on the customization option selected and the final artwork on the garment.";

const VALID_IDS = new Set<string>(PRODUCT_CUSTOMIZATION_TYPES.map((t) => t.id));

/** @deprecated Legacy single “embroidery” selection — maps to flat + puff when loading old rows. */
const LEGACY_EMBROIDERY_ID = "embroidery";

export function parseCustomizationTypeIds(raw: unknown): ProductCustomizationTypeId[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: ProductCustomizationTypeId[] = [];
  let sawLegacyEmbroidery = false;
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    if (item === LEGACY_EMBROIDERY_ID) {
      sawLegacyEmbroidery = true;
      continue;
    }
    if (!VALID_IDS.has(item)) continue;
    if (!out.includes(item as ProductCustomizationTypeId)) {
      out.push(item as ProductCustomizationTypeId);
    }
  }
  if (sawLegacyEmbroidery) {
    for (const id of ["embroidery_flat", "embroidery_puff"] as const) {
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

export function customizationTypeLabelsFromIds(
  customizationTypeIds: unknown,
): string[] {
  const ids = parseCustomizationTypeIds(customizationTypeIds);
  const labelById = new Map(PRODUCT_CUSTOMIZATION_TYPES.map((t) => [t.id, t.label]));
  const labels: string[] = [];
  for (const id of ids) {
    const label = labelById.get(id);
    if (label) labels.push(label);
  }
  return labels;
}

/** When customization is offered, at least one type must be selected. */
export function hasRequiredCustomizationTypes(
  offerCustomization: boolean,
  customizationTypeIds: unknown,
): boolean {
  if (!offerCustomization) return true;
  return parseCustomizationTypeIds(customizationTypeIds).length > 0;
}
