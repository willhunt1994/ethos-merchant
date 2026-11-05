import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Link, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { W9SettingsPanel } from "../components/embedded/w9-settings-panel";
import { SupplierApprovalBanner } from "../components/supplier-approval-banner";
import styles from "../styles/embedded-app.module.css";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { getShopSupplierLinkView } from "../lib/shop-supplier.server";
import {
  fetchShopBillingProfile,
  previewShopBillingProfile,
} from "../lib/shopify/shop-billing.server";
import {
  createConnectOnboardingLink,
  createConnectUpdateLink,
  isStripeConnectConfigured,
  refreshConnectAccountForShop,
} from "../lib/stripe/connect.server";
import { getPayoutReadiness, payoutReadinessFromShop } from "../lib/stripe/payout-gate.server";
import { PayoutSettingsPanel } from "../components/embedded/payout-settings-panel";
import { QuantityBreakTiersPanel } from "../components/embedded/quantity-break-tiers-panel";
import {
  parseAndValidateQuantityBreakTiers,
  type QuantityTierDefinition,
} from "../lib/quantity-tier-definitions";
import { quantityBreakTiersFromShopRecord } from "../lib/shop-quantity-tiers.server";
import {
  formatW9BusinessAddress,
  validateW9Address,
  w9AddressFromFormData,
} from "../lib/w9-address";
import {
  canDownloadW9Form,
  saveShopW9FormUpload,
  w9FormViewFromShop,
} from "../lib/w9-form.server";
import { isMerchantS3Configured } from "../lib/s3.server";

const DEFAULT_W9_TEMPLATE_URL = "https://www.irs.gov/pub/irs-pdf/fw9.pdf";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
  const supplier = await getShopSupplierLinkView(ctx.shopDomain, {
    previewMode: ctx.mode === "preview",
  });

  let shopifyBilling = null;
  if (ctx.mode === "preview") {
    shopifyBilling = previewShopBillingProfile(ctx.shopDomain);
  } else if (ctx.admin) {
    shopifyBilling = await fetchShopBillingProfile(ctx.admin);
  }

  const w9TemplateUrl =
    process.env.ETHOS_W9_TEMPLATE_URL?.trim() || DEFAULT_W9_TEMPLATE_URL;

  const savedLegalBusinessName = shop?.w9LegalBusinessName?.trim() ?? "";
  const savedBusinessAddress = shop?.w9BusinessAddress?.trim() ?? "";

  const stripeConfigured = isStripeConnectConfigured();
  let payout = await getPayoutReadiness(ctx.shopDomain);
  const url = new URL(request.url);
  if (
    ctx.mode === "shopify" &&
    stripeConfigured &&
    shop &&
    (url.searchParams.get("payout") === "return" || url.searchParams.get("refresh") === "1")
  ) {
    const refreshed = await refreshConnectAccountForShop(ctx.shopDomain);
    payout = payoutReadinessFromShop(refreshed, stripeConfigured);
  }

  return {
    mode: ctx.mode,
    shopDomain: ctx.shopDomain,
    isAccountOwner: ctx.isAccountOwner,
    installedAt: shop?.installedAt?.toISOString() ?? null,
    lastSyncAt: shop?.lastSyncAt?.toISOString() ?? null,
    supplier,
    w9TemplateUrl,
    w9: {
      legalBusinessName:
        savedLegalBusinessName || shopifyBilling?.legalBusinessName || "",
      businessAddress: savedBusinessAddress || shopifyBilling?.businessAddress || "",
      savedLegalBusinessName,
      savedBusinessAddress,
    },
    w9Form: w9FormViewFromShop(shop),
    w9FormDownloadAvailable: canDownloadW9Form(shop),
    s3Configured: isMerchantS3Configured(),
    shopifyBilling: {
      legalBusinessName: shopifyBilling?.legalBusinessName ?? "",
      businessAddress: shopifyBilling?.businessAddress ?? "",
      available: Boolean(shopifyBilling?.legalBusinessName || shopifyBilling?.businessAddress),
    },
    payout,
    quantityBreakTiers: quantityBreakTiersFromShopRecord(shop?.quantityBreakTiers),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "start-payout-onboarding" || intent === "refresh-payout-status") {
    if (ctx.mode === "preview") {
      return Response.json({ ok: false, error: "Not available in local preview" }, { status: 400 });
    }
    if (!ctx.isAccountOwner) {
      return Response.json(
        { ok: false, error: "Only the store owner can manage payout bank accounts." },
        { status: 403 },
      );
    }
    if (!isStripeConnectConfigured()) {
      return Response.json({ ok: false, error: "Payout setup is not configured." }, { status: 503 });
    }

    const shop = await prisma.shop.findUnique({ where: { shopDomain: ctx.shopDomain } });
    if (!shop) {
      return Response.json({ ok: false, error: "Shop record not found." }, { status: 404 });
    }

    if (intent === "refresh-payout-status") {
      await refreshConnectAccountForShop(ctx.shopDomain);
      return redirect("/app/settings?section=payout");
    }

    const onboardingUrl = shop.stripeConnectAccountId
      ? await createConnectUpdateLink(shop)
      : await createConnectOnboardingLink(shop);
    return redirect(onboardingUrl);
  }

  if (intent === "upload-w9") {
    const uploadFile = form.get("file");
    const isFileLike =
      uploadFile instanceof Blob ||
      (typeof uploadFile === "object" &&
        uploadFile !== null &&
        "arrayBuffer" in uploadFile &&
        typeof (uploadFile as Blob).arrayBuffer === "function");
    if (!isFileLike || uploadFile.size === 0) {
      return Response.json({ ok: false, error: "Choose a completed W-9 PDF to upload." }, { status: 400 });
    }
    const fileBlob = uploadFile as Blob;
    const filename =
      String(form.get("filename") ?? "").trim() ||
      (fileBlob instanceof File ? fileBlob.name : "w9.pdf");
    const contentType =
      String(form.get("contentType") ?? "").trim() ||
      (fileBlob instanceof File ? fileBlob.type : "") ||
      "application/pdf";
    const body = Buffer.from(await fileBlob.arrayBuffer());
    const previewStub = ctx.mode === "preview" && !isMerchantS3Configured();
    const result = await saveShopW9FormUpload({
      shopDomain: ctx.shopDomain,
      filename,
      contentType,
      body,
      previewStub,
    });
    if (!result.ok) {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
    return Response.json({ ok: true, intent: "upload-w9" as const, form: result.form });
  }

  if (intent === "save-quantity-break-tiers") {
    const raw = String(form.get("quantityBreakTiers") ?? "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return Response.json({ ok: false, error: "Invalid tier data." }, { status: 400 });
    }
    const validated = parseAndValidateQuantityBreakTiers(parsed);
    if (!validated.ok) {
      return Response.json({ ok: false, error: validated.error }, { status: 400 });
    }
    const payload = validated.tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty }));
    await prisma.shop.upsert({
      where: { shopDomain: ctx.shopDomain },
      create: { shopDomain: ctx.shopDomain, quantityBreakTiers: payload },
      update: { quantityBreakTiers: payload },
    });
    return Response.json({ ok: true, intent: "save-quantity-break-tiers" as const });
  }

  if (intent !== "save-w9") {
    return Response.json({ ok: false, error: "Unknown intent" }, { status: 400 });
  }

  const legalBusinessName = String(form.get("legalBusinessName") ?? "").trim();
  const addressParts = w9AddressFromFormData(form);
  const addressError = validateW9Address(addressParts);
  if (!legalBusinessName) {
    return Response.json({ ok: false, error: "Legal business name is required." }, { status: 400 });
  }
  if (addressError) {
    return Response.json({ ok: false, error: addressError }, { status: 400 });
  }
  const businessAddress = formatW9BusinessAddress(addressParts);

  await prisma.shop.upsert({
    where: { shopDomain: ctx.shopDomain },
    create: {
      shopDomain: ctx.shopDomain,
      w9LegalBusinessName: legalBusinessName,
      w9BusinessAddress: businessAddress,
    },
    update: {
      w9LegalBusinessName: legalBusinessName,
      w9BusinessAddress: businessAddress,
    },
  });

  return Response.json({ ok: true, intent: "save-w9" as const });
};

function approvalLabel(status: string): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "pending":
      return "Pending Approval";
    case "rejected":
      return "Not Approved";
    default:
      return "Not Linked";
  }
}

function approvalTagClass(status: string): string {
  switch (status) {
    case "approved":
      return styles.attachmentStatusTagSuccess;
    case "pending":
      return styles.attachmentStatusTagWarning;
    case "rejected":
      return styles.attachmentStatusTagDanger;
    default:
      return styles.attachmentStatusTagNeutral;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const SETTINGS_SECTIONS = [
  { id: "shopify", label: "Shopify Connection" },
  { id: "w9", label: "W-9 Tax Form" },
  { id: "payout", label: "Payout Bank Account" },
  { id: "quantity-tiers", label: "Quantity Break Tiers" },
] as const;

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

function parseSettingsSection(value: string | null): SettingsSectionId {
  if (value === "supplier") return "shopify";
  if (SETTINGS_SECTIONS.some((s) => s.id === value)) {
    return value as SettingsSectionId;
  }
  return "shopify";
}

export default function SettingsPage() {
  const {
    mode,
    shopDomain,
    installedAt,
    lastSyncAt,
    supplier,
    w9,
    shopifyBilling,
    w9TemplateUrl,
    w9Form,
    w9FormDownloadAvailable,
    s3Configured,
    payout,
    isAccountOwner,
    quantityBreakTiers,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const saveOk =
    actionData != null &&
    typeof actionData === "object" &&
    "ok" in actionData &&
    (actionData as { ok?: boolean }).ok === true &&
    (actionData as { intent?: string }).intent === "save-w9";
  const quantityTiersSaveOk =
    actionData != null &&
    typeof actionData === "object" &&
    "ok" in actionData &&
    (actionData as { ok?: boolean }).ok === true &&
    (actionData as { intent?: string }).intent === "save-quantity-break-tiers";
  const quantityTiersSaveError =
    actionData != null &&
    typeof actionData === "object" &&
    "ok" in actionData &&
    (actionData as { ok?: boolean }).ok === false
      ? String((actionData as { error?: string }).error ?? "")
      : null;

  const supplierHelpText =
    supplier.approvalStatus === "pending"
      ? "You can browse, select, and upload design files while approval is pending. Submission stays disabled until Ethos approves the link."
      : supplier.approvalStatus === "rejected"
        ? "Contact your Ethos representative to review the supplier link for this store."
        : supplier.ethosSupplierSlug
          ? null
          : "Contact your Ethos representative to request a supplier link for this store.";

  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection =
    searchParams.get("payout") === "return"
      ? "payout"
      : parseSettingsSection(searchParams.get("section"));

  useEffect(() => {
    if (saveOk) {
      setSearchParams({ section: "w9" }, { replace: true });
    }
  }, [saveOk, setSearchParams]);

  useEffect(() => {
    if (quantityTiersSaveOk) {
      setSearchParams({ section: "quantity-tiers" }, { replace: true });
    }
  }, [quantityTiersSaveOk, setSearchParams]);

  const setActiveSection = (section: SettingsSectionId) => {
    setSearchParams({ section }, { replace: true });
  };

  return (
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>Settings</h1>
        <Link to="/app" className={styles.settingsButton}>
          Back to Dashboard
        </Link>
      </div>

      <SupplierApprovalBanner supplier={supplier} />

      <s-section>
        <div className={styles.settingsLayout}>
          <nav className={styles.settingsNav} aria-label="Settings sections">
            {SETTINGS_SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.settingsNavItem} ${
                  activeSection === item.id ? styles.settingsNavItemActive : ""
                }`}
                aria-current={activeSection === item.id ? "page" : undefined}
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className={styles.settingsMain}>
            {activeSection === "shopify" ? (
              <div className={styles.settingsPanelStack}>
                <section className={styles.settingsPanel} aria-labelledby="settings-shopify-heading">
                  <h2 id="settings-shopify-heading" className={styles.settingsPanelTitle}>
                    Shopify Connection
                  </h2>
                  <ul className={styles.settingsDetailList}>
                    <li className={styles.settingsDetailRow}>
                      <span className={styles.settingsDetailKey}>Store</span>
                      <span className={styles.settingsDetailValue}>
                        {shopDomain}
                        {mode === "preview" ? (
                          <span className={styles.productMeta}> · Local preview</span>
                        ) : null}
                      </span>
                    </li>
                    <li className={styles.settingsDetailRow}>
                      <span className={styles.settingsDetailKey}>Installed</span>
                      <span className={styles.settingsDetailValue}>
                        {formatDateTime(installedAt)}
                      </span>
                    </li>
                    <li className={styles.settingsDetailRow}>
                      <span className={styles.settingsDetailKey}>Last Sync</span>
                      <span className={styles.settingsDetailValue}>
                        {formatDateTime(lastSyncAt)}
                      </span>
                    </li>
                    <li className={styles.settingsDetailRow}>
                      <span className={styles.settingsDetailKey}>Ethos Supplier Status</span>
                      <span className={approvalTagClass(supplier.approvalStatus)}>
                        {approvalLabel(supplier.approvalStatus)}
                      </span>
                    </li>
                  </ul>
                </section>

                <section className={styles.settingsPanel} aria-labelledby="settings-supplier-heading">
                  <h2 id="settings-supplier-heading" className={styles.settingsPanelTitle}>
                    Ethos Supplier
                  </h2>
                  {supplier.ethosSupplierSlug ? (
                    <ul className={styles.settingsDetailList}>
                      <li className={styles.settingsDetailRow}>
                        <span className={styles.settingsDetailKey}>Supplier Slug</span>
                        <span className={styles.settingsDetailValue}>
                          {supplier.ethosSupplierSlug}
                          {supplier.ethosSupplierId ? (
                            <span className={styles.productMeta}>
                              {" "}
                              · ID {supplier.ethosSupplierId}
                            </span>
                          ) : null}
                        </span>
                      </li>
                      <li className={styles.settingsDetailRow}>
                        <span className={styles.settingsDetailKey}>Approved</span>
                        <span className={styles.settingsDetailValue}>
                          {formatDateTime(supplier.approvedAt)}
                        </span>
                      </li>
                    </ul>
                  ) : (
                    <p className={styles.settingsHelpText}>
                      No supplier is linked to this store yet. Ethos links your Shopify shop to your
                      custom supplier record—you cannot submit products until that link is approved.
                    </p>
                  )}
                  {supplierHelpText ? (
                    <p className={styles.settingsHelpText}>{supplierHelpText}</p>
                  ) : null}
                </section>
              </div>
            ) : null}

            {activeSection === "w9" ? (
              <W9SettingsPanel
                initialLegalBusinessName={w9.legalBusinessName}
                initialBusinessAddress={w9.businessAddress}
                savedLegalBusinessName={w9.savedLegalBusinessName}
                savedBusinessAddress={w9.savedBusinessAddress}
                shopifyLegalBusinessName={shopifyBilling.legalBusinessName}
                shopifyBusinessAddress={shopifyBilling.businessAddress}
                shopifyAvailable={shopifyBilling.available}
                w9TemplateUrl={w9TemplateUrl}
                w9Form={w9Form}
                w9FormDownloadAvailable={w9FormDownloadAvailable}
                s3Configured={s3Configured}
                previewMode={mode === "preview"}
                saveOk={saveOk}
              />
            ) : null}

            {activeSection === "payout" ? (
              <PayoutSettingsPanel
                payout={payout}
                canManage={isAccountOwner && mode !== "preview"}
                previewMode={mode === "preview"}
              />
            ) : null}

            {activeSection === "quantity-tiers" ? (
              <QuantityBreakTiersPanel
                initialTiers={quantityBreakTiers as QuantityTierDefinition[]}
                saveOk={quantityTiersSaveOk}
                saveError={quantityTiersSaveError}
              />
            ) : null}

          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
