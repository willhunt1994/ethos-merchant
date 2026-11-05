import type { Shop } from "@prisma/client";
import {
  CURRENT_VENDOR_AGREEMENT_VERSION,
} from "./vendor-agreement-content";
import {
  isScheduleAComplete,
  scheduleAFromShop,
  scheduleAFromFormData,
  scheduleAShopJson,
  validateScheduleA,
  type VendorAgreementScheduleA,
} from "./vendor-agreement-schedule-a";
import {
  isDrawnVendorSignature,
  validateDrawnVendorSignature,
} from "./vendor-signature";
import {
  formatW9BusinessAddress,
  parseW9BusinessAddress,
  validateW9Address,
  w9AddressFromFormData,
} from "./w9-address";

export type VendorAgreementDraft = {
  legalName: string;
  dba: string;
  entityType: string;
  entityFormation: string;
  businessAddress: string;
  website: string;
  primaryContact: string;
  contactEmail: string;
  contactPhone: string;
  signatoryName: string;
  signatoryTitle: string;
  signatureText: string;
};

export type VendorAgreementView = VendorAgreementDraft & {
  version: string | null;
  signedAt: string | null;
  isSigned: boolean;
  isCurrentVersion: boolean;
  scheduleA: VendorAgreementScheduleA;
  scheduleAComplete: boolean;
  ethosSignedAt: string | null;
  ethosSignatoryName: string | null;
  ethosSignatoryTitle: string | null;
  pendingEthosCounterSign: boolean;
  fullyExecuted: boolean;
};

function entityFieldsFromShop(shop: Shop | null): {
  entityType: string;
  entityFormation: string;
} {
  let entityType = shop?.vendorAgreementEntityType?.trim() ?? "";
  let entityFormation = shop?.vendorAgreementEntityFormation?.trim() ?? "";
  if (!entityFormation && entityType.includes(",")) {
    const comma = entityType.indexOf(",");
    entityFormation = entityType.slice(comma + 1).trim();
    entityType = entityType.slice(0, comma).trim();
  }
  return { entityType, entityFormation };
}

function contactFieldsFromShop(shop: Shop | null): {
  contactEmail: string;
  contactPhone: string;
} {
  let contactEmail = shop?.vendorAgreementContactEmail?.trim() ?? "";
  let contactPhone = shop?.vendorAgreementContactPhone?.trim() ?? "";
  const legacy = shop?.vendorAgreementContactInfo?.trim() ?? "";
  if (legacy && (!contactEmail || !contactPhone)) {
    const parts = legacy.split(/\s*(?:\/|\|)\s*/).map((p) => p.trim()).filter(Boolean);
    if (!contactEmail && parts[0]) contactEmail = parts[0];
    if (!contactPhone && parts[1]) contactPhone = parts[1];
    if (!contactEmail && legacy.includes("@")) contactEmail = legacy;
    else if (!contactPhone && parts.length === 1 && !legacy.includes("@")) {
      contactPhone = legacy;
    } else if (!contactEmail && parts.length === 1) {
      contactEmail = legacy;
    }
  }
  return { contactEmail, contactPhone };
}

export function vendorAgreementDraftFromShop(shop: Shop | null): VendorAgreementDraft {
  const { entityType, entityFormation } = entityFieldsFromShop(shop);
  return {
    legalName: shop?.vendorAgreementLegalName?.trim() ?? "",
    dba: shop?.vendorAgreementDba?.trim() ?? "",
    entityType,
    entityFormation,
    businessAddress: shop?.vendorAgreementBusinessAddress?.trim() ?? "",
    website: shop?.vendorAgreementWebsite?.trim() ?? "",
    primaryContact: shop?.vendorAgreementPrimaryContact?.trim() ?? "",
    ...contactFieldsFromShop(shop),
    signatoryName: shop?.vendorAgreementSignatoryName?.trim() ?? "",
    signatoryTitle: shop?.vendorAgreementSignatoryTitle?.trim() ?? "",
    signatureText: shop?.vendorAgreementSignatureText?.trim() ?? "",
  };
}

export function vendorAgreementViewFromShop(shop: Shop | null): VendorAgreementView {
  const draft = vendorAgreementDraftFromShop(shop);
  const signedAt = shop?.vendorAgreementSignedAt?.toISOString() ?? null;
  const version = shop?.vendorAgreementVersion?.trim() ?? null;
  const isSigned = Boolean(signedAt && version);
  const isCurrentVersion = isSigned && version === CURRENT_VENDOR_AGREEMENT_VERSION;
  const scheduleA = scheduleAFromShop(shop);
  const scheduleAComplete = isScheduleAComplete(scheduleA);
  const ethosSignedAt = shop?.vendorAgreementEthosSignedAt?.toISOString() ?? null;
  const vendorComplete = isSigned && isCurrentVersion && scheduleAComplete;
  return {
    ...draft,
    version,
    signedAt,
    isSigned,
    isCurrentVersion,
    scheduleA,
    scheduleAComplete,
    ethosSignedAt,
    ethosSignatoryName: shop?.vendorAgreementEthosSignatoryName?.trim() || null,
    ethosSignatoryTitle: shop?.vendorAgreementEthosSignatoryTitle?.trim() || null,
    pendingEthosCounterSign: vendorComplete && !ethosSignedAt,
    fullyExecuted: vendorComplete && Boolean(ethosSignedAt),
  };
}

export function isVendorAgreementComplete(shop: Shop | null): boolean {
  const view = vendorAgreementViewFromShop(shop);
  return view.isSigned && view.isCurrentVersion && view.scheduleAComplete;
}

export function normalizeVendorWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function validateVendorWebsite(raw: string): string | null {
  const normalized = normalizeVendorWebsite(raw);
  if (!normalized) return "Business website is required.";
  try {
    const url = new URL(normalized);
    if (!url.hostname || !url.hostname.includes(".")) {
      return "Enter a valid website URL.";
    }
  } catch {
    return "Enter a valid website URL.";
  }
  return null;
}

function businessAddressFromFormData(form: FormData): string {
  const line1 = String(form.get("addressLine1") ?? "").trim();
  if (line1) {
    return formatW9BusinessAddress(w9AddressFromFormData(form));
  }
  return String(form.get("businessAddress") ?? "").trim();
}

export function vendorAgreementDraftFromFormData(form: FormData): VendorAgreementDraft {
  return {
    legalName: String(form.get("legalName") ?? "").trim(),
    dba: String(form.get("dba") ?? "").trim(),
    entityType: String(form.get("entityType") ?? "").trim(),
    entityFormation: String(form.get("entityFormation") ?? "").trim(),
    businessAddress: businessAddressFromFormData(form),
    website: normalizeVendorWebsite(String(form.get("website") ?? "")),
    primaryContact: String(form.get("primaryContact") ?? "").trim(),
    contactEmail: String(form.get("contactEmail") ?? "").trim(),
    contactPhone: String(form.get("contactPhone") ?? "").trim(),
    signatoryName: String(form.get("signatoryName") ?? "").trim(),
    signatoryTitle: String(form.get("signatoryTitle") ?? "").trim(),
    signatureText: String(form.get("signatureText") ?? "").trim(),
  };
}

function validateDraftFields(draft: VendorAgreementDraft): string | null {
  if (!draft.legalName) return "Legal business name is required.";
  if (!draft.entityType) return "Entity type is required.";
  if (!draft.entityFormation) return "State/country of formation is required.";
  if (!draft.businessAddress) return "Business address is required.";
  const addressParts = parseW9BusinessAddress(draft.businessAddress);
  const addressError = validateW9Address(addressParts);
  if (addressError) return addressError;
  if (!addressParts.country.trim()) return "Country is required.";
  const websiteError = validateVendorWebsite(draft.website);
  if (websiteError) return websiteError;
  if (!draft.primaryContact) return "Primary contact and title is required.";
  if (!draft.contactEmail) return "Email is required.";
  if (!draft.contactPhone) return "Phone is required.";
  return null;
}

export function validateVendorAgreementDraft(
  draft: VendorAgreementDraft,
  schedule: VendorAgreementScheduleA,
): string | null {
  const base = validateDraftFields(draft);
  if (base) return base;
  return validateScheduleA(schedule, "draft");
}

export function validateVendorAgreementSign(
  draft: VendorAgreementDraft,
  schedule: VendorAgreementScheduleA,
  opts: { certifyAccurate: boolean; consentEsign: boolean },
): string | null {
  const base = validateDraftFields(draft);
  if (base) return base;
  const scheduleError = validateScheduleA(schedule, "sign");
  if (scheduleError) return scheduleError;
  if (!draft.signatoryName) return "Authorized signatory name is required.";
  if (!draft.signatoryTitle) return "Signatory title is required.";
  if (!draft.signatureText) return "Add your electronic signature before signing.";
  if (isDrawnVendorSignature(draft.signatureText)) {
    const drawnError = validateDrawnVendorSignature(draft.signatureText);
    if (drawnError) return drawnError;
  } else if (
    draft.signatureText.trim().toLowerCase() !== draft.signatoryName.trim().toLowerCase()
  ) {
    return "Electronic signature must match the authorized signatory name exactly.";
  }
  if (!opts.certifyAccurate) return "Confirm the vendor certifications before signing.";
  if (!opts.consentEsign) return "Consent to electronic records and signatures is required.";
  return null;
}

export function vendorAgreementShopDataFromDraft(
  draft: VendorAgreementDraft,
  schedule: VendorAgreementScheduleA,
) {
  return {
    vendorAgreementLegalName: draft.legalName,
    vendorAgreementDba: draft.dba || null,
    vendorAgreementEntityType: draft.entityType,
    vendorAgreementEntityFormation: draft.entityFormation,
    vendorAgreementBusinessAddress: draft.businessAddress,
    vendorAgreementWebsite: draft.website,
    vendorAgreementPrimaryContact: draft.primaryContact,
    vendorAgreementContactEmail: draft.contactEmail,
    vendorAgreementContactPhone: draft.contactPhone,
    vendorAgreementContactInfo:
      draft.contactEmail && draft.contactPhone
        ? `${draft.contactEmail} / ${draft.contactPhone}`
        : draft.contactEmail || draft.contactPhone || null,
    vendorAgreementSignatoryName: draft.signatoryName || null,
    vendorAgreementSignatoryTitle: draft.signatoryTitle || null,
    vendorAgreementSignatureText: draft.signatureText || null,
    vendorAgreementScheduleA: scheduleAShopJson(schedule),
  };
}

export { scheduleAFromFormData };

export function buildVendorAgreementAudit(request: Request, shopDomain: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  return {
    shopDomain,
    agreementVersion: CURRENT_VENDOR_AGREEMENT_VERSION,
    signedAt: new Date().toISOString(),
    ip,
    userAgent: request.headers.get("user-agent"),
  };
}
