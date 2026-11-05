import type { Shop } from "@prisma/client";

/** Must match accepted Schedule A records in Shop.vendorAgreementScheduleA.version */
export const CURRENT_SCHEDULE_A_VERSION = "draft-2026-11-v1";

export type VendorAgreementScheduleA = {
  version: string;
  termsAccepted: boolean;
  additionalTerms: string;
};

export type ScheduleASection = {
  id: string;
  title: string;
  paragraphs: string[];
};

/** Default Schedule A commercial terms (draft — legal review before execution). */
export const SCHEDULE_A_SECTIONS: ScheduleASection[] = [
  {
    id: "commercial-model",
    title: "Commercial Model",
    paragraphs: [
      "Unless Ethos and Vendor agree otherwise in writing for a specific product or order, Vendor participates on a marketplace / revenue-share basis: Ethos resells Vendor products on the Platform under Ethos’s seller-of-record model for end customers, and remits Vendor’s share according to the payout rules below.",
    ],
  },
  {
    id: "seller-of-record",
    title: "Seller of Record",
    paragraphs: [
      "Ethos is the seller of record to end customers for Platform sales unless a separate written order explicitly states otherwise. Vendor remains responsible for the accuracy of product information, compliance of listed goods, and fulfillment obligations assigned to Vendor in this Schedule A.",
    ],
  },
  {
    id: "catalog-pricing",
    title: "Catalog, Costs, and Pricing",
    paragraphs: [
      "Approved product categories and SKUs are those Vendor configures and submits through the merchant app for Ethos import. Vendor cost and resale pricing are set in the Platform configuration and import records; changes apply prospectively after Ethos acceptance. Minimum retail price commitments, if any, apply only where Vendor submits a product-specific minimum and Ethos expressly accepts it in writing (see Agreement Section 5.1 — not enforced until legal approval).",
    ],
  },
  {
    id: "customization",
    title: "Customization",
    paragraphs: [
      "Where Vendor offers customization, fees and specifications follow the customization types and design files submitted with each product. Ethos may perform decoration and fulfillment services as described in the Agreement.",
    ],
  },
  {
    id: "commission-payouts",
    title: "Commission and Payouts",
    paragraphs: [
      "Vendor’s net share is calculated from completed Platform sales per Ethos’s then-current fee schedule and the pricing submitted for each SKU. Payouts are triggered after order completion and any applicable hold period, on the cadence Ethos enables for the Vendor account (typically periodic transfer to Vendor’s connected bank account once verification and this Agreement are fully executed).",
    ],
  },
  {
    id: "fees-returns",
    title: "Fees, Refunds, and Chargebacks",
    paragraphs: [
      "Payment processing, platform, and agreed service fees may be deducted from Vendor’s share as disclosed by Ethos. Refunds, cancellations, and chargebacks are allocated between the parties according to the cause: Vendor bears responsibility for nonconforming or misdescribed Vendor goods; Ethos bears customization errors solely attributable to Ethos, except as otherwise agreed.",
    ],
  },
  {
    id: "inventory-shipping",
    title: "Inventory, Shipping, and Fulfillment",
    paragraphs: [
      "Title and risk of loss follow the commercial model for each order as stated in the Agreement and accepted purchase records. Shipping, insurance, and fulfillment responsibilities are performed per approved product configuration and Ethos operational rules unless an order specifies otherwise.",
    ],
  },
  {
    id: "tax-insurance",
    title: "Tax and Insurance",
    paragraphs: [
      "Sales tax collection and remittance follow the seller-of-record assignment above and applicable law. Vendor maintains any insurance required for its products and operations; additional caps or requirements may be set in a signed amendment.",
    ],
  },
];

export function emptyScheduleA(): VendorAgreementScheduleA {
  return {
    version: CURRENT_SCHEDULE_A_VERSION,
    termsAccepted: false,
    additionalTerms: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function legacyFieldEntryComplete(raw: Record<string, unknown>): boolean {
  const commercialModel = raw.commercialModel;
  const sellerOfRecord = raw.sellerOfRecord;
  const payment = raw.paymentTriggerAndFrequency;
  return (
    typeof commercialModel === "string" &&
    commercialModel.trim().length > 0 &&
    typeof sellerOfRecord === "string" &&
    sellerOfRecord.trim().length > 0 &&
    typeof payment === "string" &&
    payment.trim().length > 0
  );
}

export function scheduleAFromShop(shop: Shop | null): VendorAgreementScheduleA {
  const raw = shop?.vendorAgreementScheduleA;
  if (!isRecord(raw)) return emptyScheduleA();

  if (typeof raw.termsAccepted === "boolean" || typeof raw.version === "string") {
    return {
      version:
        typeof raw.version === "string" && raw.version.trim()
          ? raw.version.trim()
          : CURRENT_SCHEDULE_A_VERSION,
      termsAccepted: raw.termsAccepted === true,
      additionalTerms:
        typeof raw.additionalTerms === "string" ? raw.additionalTerms.trim() : "",
    };
  }

  if (legacyFieldEntryComplete(raw)) {
    return {
      version: "legacy-field-entry",
      termsAccepted: true,
      additionalTerms:
        typeof raw.otherTerms === "string" ? raw.otherTerms.trim() : "",
    };
  }

  return emptyScheduleA();
}

export function scheduleAFromFormData(form: FormData): VendorAgreementScheduleA {
  const version =
    String(form.get("scheduleA_version") ?? "").trim() || CURRENT_SCHEDULE_A_VERSION;
  return {
    version,
    termsAccepted: form.get("scheduleA_termsAccepted") === "yes",
    additionalTerms: String(form.get("scheduleA_additionalTerms") ?? "").trim(),
  };
}

export function validateScheduleA(
  schedule: VendorAgreementScheduleA,
  mode: "draft" | "sign",
): string | null {
  if (mode === "draft") return null;
  if (!schedule.termsAccepted) {
    return "Accept Schedule A commercial terms before signing the agreement.";
  }
  if (
    schedule.version !== CURRENT_SCHEDULE_A_VERSION &&
    schedule.version !== "legacy-field-entry"
  ) {
    return "Schedule A version is out of date. Review and accept the current Schedule A terms.";
  }
  return null;
}

export function isScheduleAComplete(schedule: VendorAgreementScheduleA): boolean {
  return validateScheduleA(schedule, "sign") === null;
}

export function scheduleAShopJson(schedule: VendorAgreementScheduleA) {
  return {
    version: schedule.version,
    termsAccepted: schedule.termsAccepted,
    additionalTerms: schedule.additionalTerms || null,
  };
}
