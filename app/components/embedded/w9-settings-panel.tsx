import { Form, useFetcher, useNavigation, useRevalidator } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../../styles/embedded-app.module.css";
import {
  formatW9BusinessAddress,
  parseW9BusinessAddress,
  type W9AddressParts,
} from "../../lib/w9-address";
import type { W9FormView } from "../../lib/w9-form.server";

type W9SettingsPanelProps = {
  initialLegalBusinessName: string;
  initialBusinessAddress: string;
  savedLegalBusinessName: string;
  savedBusinessAddress: string;
  shopifyLegalBusinessName: string;
  shopifyBusinessAddress: string;
  shopifyAvailable: boolean;
  w9TemplateUrl: string;
  w9Form: W9FormView;
  w9FormDownloadAvailable: boolean;
  s3Configured: boolean;
  previewMode: boolean;
  saveOk?: boolean;
};

function partsFromStrings(name: string, addressBlock: string): {
  legalBusinessName: string;
  address: W9AddressParts;
} {
  return {
    legalBusinessName: name,
    address: parseW9BusinessAddress(addressBlock),
  };
}

export function W9SettingsPanel({
  initialLegalBusinessName,
  initialBusinessAddress,
  savedLegalBusinessName,
  savedBusinessAddress,
  shopifyLegalBusinessName,
  shopifyBusinessAddress,
  shopifyAvailable,
  w9TemplateUrl,
  w9Form,
  w9FormDownloadAvailable,
  s3Configured,
  previewMode,
  saveOk,
}: W9SettingsPanelProps) {
  const navigation = useNavigation();
  const uploadFetcher = useFetcher<{ ok?: boolean; error?: string; form?: W9FormView }>();
  const revalidator = useRevalidator();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saving = navigation.state === "submitting" && navigation.formData?.get("intent") === "save-w9";
  const uploading =
    uploadFetcher.state === "submitting" && uploadFetcher.formData?.get("intent") === "upload-w9";

  const hasSaved = Boolean(savedLegalBusinessName && savedBusinessAddress);
  const [editing, setEditing] = useState(!hasSaved);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const formState = uploadFetcher.data?.form ?? w9Form;

  const initialDraft = useMemo(
    () => partsFromStrings(initialLegalBusinessName, initialBusinessAddress),
    [initialLegalBusinessName, initialBusinessAddress],
  );

  const [legalBusinessName, setLegalBusinessName] = useState(initialDraft.legalBusinessName);
  const [address, setAddress] = useState<W9AddressParts>(initialDraft.address);

  useEffect(() => {
    if (saveOk) {
      setEditing(false);
    }
  }, [saveOk]);

  useEffect(() => {
    if (uploadFetcher.data?.ok === true) {
      setUploadError(null);
      void revalidator.revalidate();
    } else if (uploadFetcher.data?.ok === false && uploadFetcher.data.error) {
      setUploadError(uploadFetcher.data.error);
    }
  }, [uploadFetcher.data, revalidator]);

  function startEdit() {
    const draft = hasSaved
      ? partsFromStrings(savedLegalBusinessName, savedBusinessAddress)
      : partsFromStrings(initialLegalBusinessName, initialBusinessAddress);
    setLegalBusinessName(draft.legalBusinessName);
    setAddress(draft.address);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function applyShopifyBilling() {
    setLegalBusinessName(shopifyLegalBusinessName);
    setAddress(parseW9BusinessAddress(shopifyBusinessAddress));
    setEditing(true);
  }

  function updateAddress<K extends keyof W9AddressParts>(key: K, value: W9AddressParts[K]) {
    setAddress((prev) => ({ ...prev, [key]: value }));
  }

  async function submitW9Upload(file: File) {
    setUploadError(null);
    const fd = new FormData();
    fd.set("intent", "upload-w9");
    fd.set("file", file);
    fd.set("filename", file.name);
    fd.set("contentType", file.type || "application/pdf");
    await uploadFetcher.submit(fd, { method: "post", encType: "multipart/form-data" });
  }

  function onW9FileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void submitW9Upload(file);
    e.target.value = "";
  }

  const savedView = partsFromStrings(savedLegalBusinessName, savedBusinessAddress);
  const savedAddressLines = formatW9BusinessAddress(savedView.address).split("\n");

  const storageReady = s3Configured || previewMode;

  const uploadButtonLabel = uploading
    ? "Uploading…"
    : formState.uploaded
      ? "Replace W-9"
      : "Upload W-9";

  return (
    <section className={styles.settingsPanel} aria-labelledby="settings-w9-heading">
      <h2 id="settings-w9-heading" className={styles.settingsPanelTitle}>
        W-9 Tax Form
      </h2>
      <p className={`${styles.settingsHelpText} ${styles.settingsIntroText}`}>
        Download and sign the W-9, upload the PDF, then save your tax details below for Ethos
        review.
      </p>

      <div className={styles.w9UploadStack} style={{ marginTop: "0.5rem" }}>
        {storageReady ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className={styles.dropzoneInput}
              onChange={onW9FileChange}
              aria-label="Upload completed W-9 PDF"
            />
            <button
              type="button"
              className={styles.primarySubmitButton}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadButtonLabel}
            </button>
          </>
        ) : null}
        <a
          href={w9TemplateUrl}
          className={styles.settingsTextLink}
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          Download W-9 template
        </a>
      </div>
      {uploadError ? (
        <p className={styles.formError} role="alert" style={{ marginTop: "0.5rem" }}>
          {uploadError}
        </p>
      ) : null}

      <div className={styles.settingsSubsectionDivider}>
        <h3 className={styles.uploadedFilesHeading}>Signed W-9 (PDF)</h3>
        {!storageReady ? (
          <p className={styles.settingsHelpText}>
            File upload is not configured on this environment yet. Contact Ethos support.
          </p>
        ) : formState.uploaded ? (
          <div className={styles.uploadedFileMeta}>
            <div className={styles.uploadedFileMetaRow}>
              <span className={styles.uploadedFileLabel}>{formState.filename ?? "w9.pdf"}</span>
              <span className={styles.attachmentStatusTagSuccess}>Uploaded</span>
            </div>
            {formState.uploadedAt ? (
              <p className={styles.settingsHelpText}>
                Uploaded {new Date(formState.uploadedAt).toLocaleString()}
              </p>
            ) : null}
            {formState.verified ? (
              <p className={styles.settingsHelpText} style={{ color: "#0d542b" }}>
                Verified by Ethos
                {formState.verifiedAt
                  ? ` · ${new Date(formState.verifiedAt).toLocaleString()}`
                  : ""}
              </p>
            ) : (
              <p className={styles.settingsHelpText}>Pending Ethos review.</p>
            )}
            {w9FormDownloadAvailable ? (
              <a
                href="/app/w9-form"
                className={styles.settingsTextLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                View PDF
              </a>
            ) : null}
          </div>
        ) : (
          <p className={styles.settingsHelpText}>No signed W-9 uploaded yet.</p>
        )}
      </div>

      <div className={styles.settingsSubsectionDivider}>
        <h3 className={styles.uploadedFilesHeading}>Tax Details</h3>

        {saveOk ? (
          <p className={styles.settingsHelpText} style={{ color: "#0d542b" }}>
            Tax details saved.
          </p>
        ) : null}

        <div className={styles.settingsActions} style={{ marginTop: "0.5rem" }}>
          {shopifyAvailable ? (
            <button type="button" className={styles.settingsButton} onClick={applyShopifyBilling}>
              Use Shopify Billing Details
            </button>
          ) : null}
          {hasSaved && !editing ? (
            <button type="button" className={styles.settingsButton} onClick={startEdit}>
              Edit Tax Details
            </button>
          ) : null}
        </div>

        {hasSaved && !editing ? (
          <ul className={styles.settingsDetailList} style={{ marginTop: "0.75rem" }}>
            <li className={styles.settingsDetailRow}>
              <span className={styles.settingsDetailKey}>Legal Business Name</span>
              <span className={styles.settingsDetailValue}>{savedView.legalBusinessName}</span>
            </li>
            <li className={styles.settingsDetailRow}>
              <span className={styles.settingsDetailKey}>Business Address</span>
              <span className={styles.settingsDetailValue}>
                {savedAddressLines.map((line) => (
                  <span key={line} style={{ display: "block" }}>
                    {line}
                  </span>
                ))}
              </span>
            </li>
          </ul>
        ) : (
          <Form method="post" className={styles.configureFormStack} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="intent" value="save-w9" />
            <label className={styles.formField}>
              <span className={styles.formFieldLabel}>Legal Business Name</span>
              <input
                type="text"
                name="legalBusinessName"
                required
                className={styles.field}
                placeholder="Legal entity name for tax reporting"
                value={legalBusinessName}
                onChange={(e) => setLegalBusinessName(e.target.value)}
                autoComplete="organization"
              />
            </label>

            <fieldset className={styles.w9AddressFieldset}>
              <legend className={styles.formFieldLabel}>Business Address</legend>
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
                  className={styles.field}
                  value={address.country}
                  onChange={(e) => updateAddress("country", e.target.value)}
                  autoComplete="country-name"
                />
              </label>
            </fieldset>

            <div className={styles.settingsActions}>
              <button type="submit" className={styles.primarySubmitButton} disabled={saving}>
                {saving ? "Saving…" : "Save Tax Details"}
              </button>
              {hasSaved ? (
                <button
                  type="button"
                  className={styles.settingsButton}
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </Form>
        )}
      </div>
    </section>
  );
}
