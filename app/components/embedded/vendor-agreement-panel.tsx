import { Form, useNavigation } from "react-router";
import { useMemo, useState } from "react";
import {
  parseW9BusinessAddress,
  type W9AddressParts,
} from "../../lib/w9-address";
import styles from "../../styles/embedded-app.module.css";
import {
  CURRENT_VENDOR_AGREEMENT_VERSION,
  VENDOR_AGREEMENT_SECTIONS,
  vendorAgreementIntroParagraphs,
} from "../../lib/vendor-agreement-content";
import { VendorSignatureLightbox } from "./vendor-signature-lightbox";
import { VendorSignaturePreview } from "./vendor-signature-pad";
import { isDrawnVendorSignature } from "../../lib/vendor-signature";
import type { VendorAgreementView } from "../../lib/vendor-agreement.server";
import {
  SCHEDULE_A_TERMS_PDF_PATH,
  VENDOR_AGREEMENT_TERMS_PDF_PATH,
} from "../../lib/vendor-agreement-pdf-paths";
import {
  CURRENT_SCHEDULE_A_VERSION,
  SCHEDULE_A_SECTIONS,
} from "../../lib/vendor-agreement-schedule-a";
import type { VendorAgreementPreviewFlags } from "../../lib/vendor-agreement-preview-mock";
import { VendorAgreementPreviewControls } from "./vendor-agreement-preview-controls";
import { VendorAgreementSignedSummary } from "./vendor-agreement-signed-summary";

type VendorAgreementPanelProps = {
  agreement: VendorAgreementView;
  previewMode: boolean;
  saveOk: boolean;
  signOk: boolean;
  actionError: string | null;
  prefillLegalName?: string;
  prefillBusinessAddress?: string;
  vendorAgreementPreviewFlags?: VendorAgreementPreviewFlags;
};

export function VendorAgreementPanel({
  agreement,
  previewMode,
  saveOk,
  signOk,
  actionError,
  prefillLegalName = "",
  prefillBusinessAddress = "",
  vendorAgreementPreviewFlags,
}: VendorAgreementPanelProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const intent = navigation.formData?.get("intent");
  const savingDraft = submitting && intent === "save-vendor-agreement-draft";
  const signing = submitting && intent === "sign-vendor-agreement";

  const [legalName, setLegalName] = useState(
    agreement.legalName || prefillLegalName,
  );
  const [dba, setDba] = useState(agreement.dba);
  const [entityType, setEntityType] = useState(agreement.entityType);
  const [entityFormation, setEntityFormation] = useState(agreement.entityFormation);
  const initialAddress = useMemo(
    () => parseW9BusinessAddress(agreement.businessAddress || prefillBusinessAddress),
    [agreement.businessAddress, prefillBusinessAddress],
  );
  const [address, setAddress] = useState<W9AddressParts>(initialAddress);

  function updateAddress(key: keyof W9AddressParts, value: string) {
    setAddress((prev) => ({ ...prev, [key]: value }));
  }
  const [website, setWebsite] = useState(agreement.website);
  const [primaryContact, setPrimaryContact] = useState(agreement.primaryContact);
  const [contactEmail, setContactEmail] = useState(agreement.contactEmail);
  const [contactPhone, setContactPhone] = useState(agreement.contactPhone);
  const [signatoryName, setSignatoryName] = useState(agreement.signatoryName);
  const [signatoryTitle, setSignatoryTitle] = useState(agreement.signatoryTitle);
  const [signatureText, setSignatureText] = useState(agreement.signatureText);
  const [certifyAccurate, setCertifyAccurate] = useState(false);
  const [consentEsign, setConsentEsign] = useState(false);
  const [acceptScheduleA, setAcceptScheduleA] = useState(agreement.scheduleA.termsAccepted);
  const [signatureLightboxOpen, setSignatureLightboxOpen] = useState(false);

  const signedLocked = agreement.isSigned && agreement.isCurrentVersion;
  const signatureComplete =
    Boolean(signatoryName.trim()) &&
    Boolean(signatoryTitle.trim()) &&
    (isDrawnVendorSignature(signatureText) || Boolean(signatureText.trim()));
  const registrationComplete =
    Boolean(primaryContact.trim()) &&
    Boolean(contactEmail.trim()) &&
    Boolean(contactPhone.trim()) &&
    Boolean(legalName.trim()) &&
    Boolean(entityType.trim()) &&
    Boolean(entityFormation.trim()) &&
    Boolean(website.trim()) &&
    Boolean(address.addressLine1.trim()) &&
    Boolean(address.city.trim()) &&
    address.state.trim().length === 2 &&
    Boolean(address.postalCode.trim()) &&
    Boolean(address.country.trim());
  const showAcceptance = !signedLocked;
  const canAcceptAgreement =
    registrationComplete &&
    acceptScheduleA &&
    certifyAccurate &&
    consentEsign &&
    signatureComplete &&
    !previewMode;

  function addressHiddenFields() {
    return (
      <>
        <input type="hidden" name="addressLine1" value={address.addressLine1} />
        <input type="hidden" name="addressLine2" value={address.addressLine2} />
        <input type="hidden" name="city" value={address.city} />
        <input type="hidden" name="state" value={address.state} />
        <input type="hidden" name="postalCode" value={address.postalCode} />
        <input type="hidden" name="country" value={address.country} />
      </>
    );
  }

  function scheduleAHiddenFields() {
    return (
      <>
        <input type="hidden" name="scheduleA_version" value={CURRENT_SCHEDULE_A_VERSION} />
        {acceptScheduleA ? (
          <input type="hidden" name="scheduleA_termsAccepted" value="yes" />
        ) : null}
        <input type="hidden" name="scheduleA_additionalTerms" value="" />
      </>
    );
  }

  return (
    <section className={styles.settingsPanel} aria-labelledby="settings-vendor-agreement-heading">
      <h2 id="settings-vendor-agreement-heading" className={styles.settingsPanelTitle}>
        Vendor Agreement
      </h2>
      <p className={`${styles.settingsHelpText} ${styles.settingsIntroText}`}>
        Review and accept the Ethos Vendor Registration &amp; Marketplace Participation Agreement
        to participate on the Platform.
      </p>

      {agreement.isSigned && !agreement.isCurrentVersion ? (
        <p className={styles.settingsHelpText} role="status">
          A newer agreement version ({CURRENT_VENDOR_AGREEMENT_VERSION}) is available. Save and sign
          again to accept the current terms.
        </p>
      ) : null}

      {saveOk ? (
        <p className={styles.settingsHelpText} style={{ color: "#15803d" }} role="status">
          Registration details saved.
        </p>
      ) : null}
      {signOk ? (
        <p className={styles.settingsHelpText} style={{ color: "#15803d" }} role="status">
          Agreement accepted. Thank you.
        </p>
      ) : null}
      {actionError ? (
        <p className={styles.formError} role="alert">
          {actionError}
        </p>
      ) : null}
      {previewMode && vendorAgreementPreviewFlags ? (
        <VendorAgreementPreviewControls
          mockSigned={vendorAgreementPreviewFlags.mockSigned}
          mockFullyExecuted={vendorAgreementPreviewFlags.mockFullyExecuted}
        />
      ) : null}
      {showAcceptance && previewMode ? (
        <p className={styles.settingsHelpText} role="status">
          Local preview can save registration drafts. Accept Agreement is available when you open
          Settings from your Shopify development store.
        </p>
      ) : null}

      {signedLocked ? <VendorAgreementSignedSummary agreement={agreement} /> : null}

      {!signedLocked ? (
      <Form method="post" className={styles.vendorAgreementForm}>
        <input type="hidden" name="intent" value="save-vendor-agreement-draft" />
        <h3 className={styles.vendorAgreementFormHeading}>Vendor Registration</h3>
        <label className={styles.formField}>
          <span className={styles.formFieldLabel}>
            Primary Contact / Title <span className={styles.requiredMark}>*</span>
          </span>
          <input
            type="text"
            name="primaryContact"
            className={styles.field}
            value={primaryContact}
            onChange={(e) => setPrimaryContact(e.target.value)}
            required
            disabled={signedLocked}
          />
        </label>
        <div className={styles.vendorAgreementFieldGrid}>
          <label className={styles.formField}>
            <span className={styles.formFieldLabel}>
              Email <span className={styles.requiredMark}>*</span>
            </span>
            <input
              type="email"
              name="contactEmail"
              className={styles.field}
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
              disabled={signedLocked}
              autoComplete="email"
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formFieldLabel}>
              Phone <span className={styles.requiredMark}>*</span>
            </span>
            <input
              type="tel"
              name="contactPhone"
              className={styles.field}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              required
              disabled={signedLocked}
              autoComplete="tel"
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formFieldLabel}>
              Legal Business Name <span className={styles.requiredMark}>*</span>
            </span>
            <input
              type="text"
              name="legalName"
              className={styles.field}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              required
              disabled={signedLocked}
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formFieldLabel}>Doing Business As (DBA)</span>
            <input
              type="text"
              name="dba"
              className={styles.field}
              value={dba}
              onChange={(e) => setDba(e.target.value)}
              disabled={signedLocked}
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formFieldLabel}>
              Entity Type <span className={styles.requiredMark}>*</span>
            </span>
            <input
              type="text"
              name="entityType"
              className={styles.field}
              placeholder="e.g. LLC"
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              required
              disabled={signedLocked}
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formFieldLabel}>
              State/Country of Formation <span className={styles.requiredMark}>*</span>
            </span>
            <input
              type="text"
              name="entityFormation"
              className={styles.field}
              placeholder="e.g. Delaware, USA"
              value={entityFormation}
              onChange={(e) => setEntityFormation(e.target.value)}
              required
              disabled={signedLocked}
            />
          </label>
          <label className={`${styles.formField} ${styles.vendorAgreementFieldGridFullSpan}`}>
            <span className={styles.formFieldLabel}>
              Business Website <span className={styles.requiredMark}>*</span>
            </span>
            <input
              type="text"
              name="website"
              className={styles.field}
              placeholder="www.example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              required
              disabled={signedLocked}
              autoComplete="url"
              inputMode="url"
            />
          </label>
        </div>
        <fieldset className={styles.w9AddressFieldset} disabled={signedLocked}>
          <legend className={styles.formFieldLabel}>
            Business Address <span className={styles.requiredMark}>*</span>
          </legend>
          <label className={styles.formField}>
            <span className={styles.formFieldLabelSecondary}>Street Address</span>
            <input
              type="text"
              name="addressLine1"
              required
              className={styles.field}
              placeholder="123 Market Street"
              value={address.addressLine1}
              onChange={(e) => updateAddress("addressLine1", e.target.value)}
              autoComplete="address-line1"
            />
          </label>
          <label className={styles.formField}>
            <span className={styles.formFieldLabelSecondary}>Apt, Suite, etc. (optional)</span>
            <input
              type="text"
              name="addressLine2"
              className={styles.field}
              placeholder="Suite 100"
              value={address.addressLine2}
              onChange={(e) => updateAddress("addressLine2", e.target.value)}
              autoComplete="address-line2"
            />
          </label>
          <div className={styles.w9AddressRow}>
            <label className={styles.formField}>
              <span className={styles.formFieldLabelSecondary}>City</span>
              <input
                type="text"
                name="city"
                required
                className={styles.field}
                value={address.city}
                onChange={(e) => updateAddress("city", e.target.value)}
                autoComplete="address-level2"
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formFieldLabelSecondary}>State</span>
              <input
                type="text"
                name="state"
                required
                className={styles.field}
                placeholder="CA"
                maxLength={2}
                value={address.state}
                onChange={(e) => updateAddress("state", e.target.value.toUpperCase())}
                autoComplete="address-level1"
              />
            </label>
            <label className={styles.formField}>
              <span className={styles.formFieldLabelSecondary}>ZIP Code</span>
              <input
                type="text"
                name="postalCode"
                required
                className={styles.field}
                placeholder="94105"
                value={address.postalCode}
                onChange={(e) => updateAddress("postalCode", e.target.value)}
                autoComplete="postal-code"
              />
            </label>
          </div>
          <label className={styles.formField}>
            <span className={styles.formFieldLabelSecondary}>Country</span>
            <input
              type="text"
              name="country"
              required
              className={styles.field}
              value={address.country}
              onChange={(e) => updateAddress("country", e.target.value)}
              autoComplete="country-name"
            />
          </label>
        </fieldset>

        <div className={styles.vendorAgreementSectionHeader}>
          <h3 className={styles.vendorAgreementFormHeading}>Vendor Agreement</h3>
          <a
            href={VENDOR_AGREEMENT_TERMS_PDF_PATH}
            className={styles.settingsButton}
            download
          >
            Download PDF
          </a>
        </div>
        <div className={styles.vendorAgreementScrollBlock}>
          <div
            className={styles.vendorAgreementScroll}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable legal text
            tabIndex={0}
            aria-label="Agreement text"
          >
            {vendorAgreementIntroParagraphs().map((p) => (
              <p key={p.slice(0, 40)} className={styles.vendorAgreementParagraph}>
                {p}
              </p>
            ))}
            {VENDOR_AGREEMENT_SECTIONS.map((section) => (
              <article key={section.id} className={styles.vendorAgreementSection}>
                <h3 className={styles.vendorAgreementSectionTitle}>{section.title}</h3>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)} className={styles.vendorAgreementParagraph}>
                    {paragraph}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </div>

        <div className={styles.vendorAgreementSectionHeader}>
          <h3 className={styles.vendorAgreementFormHeading}>Schedule A — Commercial Terms</h3>
          <a
            href={SCHEDULE_A_TERMS_PDF_PATH}
            className={styles.settingsButton}
            download
          >
            Download Terms PDF
          </a>
        </div>
        <p className={styles.settingsHelpText}>
          Review the standard commercial terms below and accept Schedule A to incorporate them into
          your agreement with Ethos.
        </p>
        <div className={styles.vendorAgreementScrollBlock}>
          <div
            className={styles.vendorAgreementScroll}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable legal text
            tabIndex={0}
            aria-label="Schedule A commercial terms"
          >
            {SCHEDULE_A_SECTIONS.map((section) => (
              <article key={section.id} className={styles.vendorAgreementSection}>
                <h4 className={styles.vendorAgreementSectionTitle}>{section.title}</h4>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)} className={styles.vendorAgreementParagraph}>
                    {paragraph}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </div>
        {signedLocked && agreement.scheduleA.termsAccepted ? (
          <p className={styles.settingsHelpText} role="status">
            Schedule A accepted.
          </p>
        ) : null}
        {showAcceptance ? (
          <label className={styles.vendorAgreementCheckbox}>
            <input
              type="checkbox"
              name="scheduleA_termsAccepted"
              checked={acceptScheduleA}
              onChange={(e) => setAcceptScheduleA(e.target.checked)}
              value="yes"
              disabled={signedLocked}
              required
              aria-required="true"
            />
            I have read and accept Schedule A commercial terms.{" "}
            <span className={styles.requiredMark} aria-hidden>
              *
            </span>
          </label>
        ) : null}

        <h3 className={styles.vendorAgreementFormHeading}>Vendor Acceptance</h3>
        <input type="hidden" name="signatoryName" value={signatoryName} />
        <input type="hidden" name="signatoryTitle" value={signatoryTitle} />
        <input type="hidden" name="signatureText" value={signatureText} />
        <label className={styles.formField}>
          <span className={styles.formFieldLabel}>
            Authorized Signatory <span className={styles.requiredMark}>*</span>
          </span>
          <button
            type="button"
            className={styles.vendorSignatureTrigger}
            onClick={() => setSignatureLightboxOpen(true)}
            disabled={signedLocked}
          >
            {signatureComplete ? (
              <>
                <VendorSignaturePreview signatureText={signatureText} />
                <span className={styles.vendorSignaturePreviewMeta}>
                  {signatoryName} · {signatoryTitle}
                </span>
              </>
            ) : (
              <span className={styles.vendorSignatureTriggerPlaceholder}>
                Click to add your signature
              </span>
            )}
          </button>
        </label>

        {showAcceptance ? (
          <>
            <label className={styles.vendorAgreementCheckbox}>
              <input
                type="checkbox"
                name="certifyAccurate"
                checked={certifyAccurate}
                onChange={(e) => setCertifyAccurate(e.target.checked)}
                value="yes"
                disabled={signedLocked}
                required
                aria-required="true"
              />
              I confirm the certifications in Section 19 (accurate information, authority to sign,
              and review of this Agreement and Schedule A).{" "}
              <span className={styles.requiredMark} aria-hidden>
                *
              </span>
            </label>
            <label className={styles.vendorAgreementCheckbox}>
              <input
                type="checkbox"
                name="consentEsign"
                checked={consentEsign}
                onChange={(e) => setConsentEsign(e.target.checked)}
                value="yes"
                disabled={signedLocked}
                required
                aria-required="true"
              />
              I consent to electronic records and signatures as described in Section 20.{" "}
              <span className={styles.requiredMark} aria-hidden>
                *
              </span>
            </label>
          </>
        ) : null}

        {showAcceptance && !canAcceptAgreement && !previewMode ? (
          <p className={styles.settingsHelpText}>
            To accept: complete registration, check Schedule A, add your signature, and confirm
            both certifications below.
          </p>
        ) : null}

        {showAcceptance ? (
          <div className={styles.configureActionRow}>
            <s-stack direction="inline" gap="base">
              <s-button type="submit" variant="secondary" disabled={savingDraft}>
                {savingDraft ? "Saving…" : "Save Draft"}
              </s-button>
            </s-stack>
          </div>
        ) : null}
      </Form>
      ) : null}

      {showAcceptance && !signedLocked ? (
        <Form method="post" className={styles.configureActionRow}>
          <input type="hidden" name="intent" value="sign-vendor-agreement" />
          <input type="hidden" name="legalName" value={legalName} />
          <input type="hidden" name="dba" value={dba} />
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityFormation" value={entityFormation} />
          {addressHiddenFields()}
          <input type="hidden" name="website" value={website} />
          <input type="hidden" name="primaryContact" value={primaryContact} />
          <input type="hidden" name="contactEmail" value={contactEmail} />
          <input type="hidden" name="contactPhone" value={contactPhone} />
          <input type="hidden" name="signatoryName" value={signatoryName} />
          <input type="hidden" name="signatoryTitle" value={signatoryTitle} />
          <input type="hidden" name="signatureText" value={signatureText} />
          {scheduleAHiddenFields()}
          {certifyAccurate ? <input type="hidden" name="certifyAccurate" value="yes" /> : null}
          {consentEsign ? <input type="hidden" name="consentEsign" value="yes" /> : null}
          <s-stack direction="inline" gap="base">
            <s-button
              type="submit"
              variant="primary"
              disabled={signing || previewMode || !canAcceptAgreement}
            >
              {signing ? "Signing…" : "Accept Agreement"}
            </s-button>
          </s-stack>
        </Form>
      ) : null}

      {!signedLocked ? (
      <VendorSignatureLightbox
        open={signatureLightboxOpen}
        onClose={() => setSignatureLightboxOpen(false)}
        signatoryName={signatoryName}
        signatoryTitle={signatoryTitle}
        signatureText={signatureText}
        onApply={(values) => {
          setSignatoryName(values.signatoryName);
          setSignatoryTitle(values.signatoryTitle);
          setSignatureText(values.signatureText);
        }}
      />
      ) : null}
    </section>
  );
}
