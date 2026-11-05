import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useState } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { ContactAttachmentField } from "../components/embedded/contact-attachment-field";
import styles from "../styles/embedded-app.module.css";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import {
  isAllowedContactAttachment,
  MAX_CONTACT_ATTACHMENT_BYTES,
} from "../lib/upload-constants";
import { isMerchantS3Configured, putPrivateObject } from "../lib/s3.server";

const DEFAULT_SUPPORT_EMAIL = "integrations@ethos.community";

function contactAttachmentStorageKey(shopDomain: string, filename: string): string {
  const prefix =
    process.env.MERCHANT_UPLOAD_S3_PREFIX?.trim() || "merchant-submissions";
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return `${prefix}/contact/${shopDomain}/${Date.now()}-${safe}`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireMerchantContext(request);
  const supportEmail =
    process.env.ETHOS_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
  return { supportEmail };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const supportEmail =
    process.env.ETHOS_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const companyPhone = String(form.get("companyPhone") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();

  if (!name) {
    return Response.json({ ok: false, error: "Name is required." }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (companyPhone && !/^[\d\s().+\-]{7,20}$/.test(companyPhone)) {
    return Response.json(
      { ok: false, error: "Enter a valid company phone number, or leave it blank." },
      { status: 400 },
    );
  }
  if (message.length < 10) {
    return Response.json(
      { ok: false, error: "Message must be at least 10 characters." },
      { status: 400 },
    );
  }

  const uploadField = form.get("attachment");
  let attachmentMeta: {
    filename: string;
    contentType: string;
    byteSize: number;
    storageKey?: string;
    stored: boolean;
  } | null = null;

  if (
    uploadField instanceof Blob &&
    uploadField.size > 0 &&
    "name" in uploadField &&
    typeof (uploadField as File).name === "string"
  ) {
    const file = uploadField as File;
    const contentType = file.type || "application/octet-stream";
    if (!isAllowedContactAttachment(file.name, contentType)) {
      return Response.json(
        { ok: false, error: "Attachment type not allowed." },
        { status: 400 },
      );
    }
    if (file.size > MAX_CONTACT_ATTACHMENT_BYTES) {
      return Response.json(
        { ok: false, error: "Attachment is too large." },
        { status: 400 },
      );
    }

    attachmentMeta = {
      filename: file.name,
      contentType,
      byteSize: file.size,
      stored: false,
    };

    if (isMerchantS3Configured()) {
      const storageKey = contactAttachmentStorageKey(ctx.shopDomain, file.name);
      const body = Buffer.from(await file.arrayBuffer());
      await putPrivateObject(storageKey, body, contentType);
      attachmentMeta = { ...attachmentMeta, storageKey, stored: true };
    }
  }

  const payload = {
    shopDomain: ctx.shopDomain,
    name,
    email,
    companyPhone: companyPhone || null,
    topic: "General inquiry",
    message,
    attachment: attachmentMeta,
    submittedAt: new Date().toISOString(),
  };

  const webhookUrl = process.env.ETHOS_CONTACT_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }
    } catch (error) {
      console.error("[contact] webhook failed", error);
      return Response.json(
        { ok: false, error: "Could not send your message. Try again or email us directly." },
        { status: 502 },
      );
    }
  } else {
    console.info("[contact] message", payload);
  }

  return Response.json({
    ok: true,
    supportEmail,
    name,
  });
};

type ContactActionData =
  | { ok: true; supportEmail: string; name: string }
  | { ok: false; error: string };

export default function ContactPage() {
  const { supportEmail } = useLoaderData<typeof loader>();
  const actionData = useActionData<ContactActionData>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  return (
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>Contact</h1>
        <Link to="/app/settings" className={styles.settingsButton}>
          Back to Settings
        </Link>
      </div>

      {actionData?.ok ? (
        <s-section>
          <s-banner tone="success" heading="Message sent">
            Thanks, {actionData.name}. We received your
            note and will reply to your email. You can also reach us at{" "}
            <a href={`mailto:${actionData.supportEmail}`} className={styles.inlineTextLink}>
              {actionData.supportEmail}
            </a>
            .
          </s-banner>
        </s-section>
      ) : null}

      {actionData && !actionData.ok ? (
        <s-section>
          <s-banner tone="critical" heading="Could not send">
            {actionData.error}
          </s-banner>
        </s-section>
      ) : null}

      <s-section>
        <div className={styles.settingsStack}>
          <section className={styles.settingsPanel} aria-labelledby="contact-ethos-heading">
            <h2 id="contact-ethos-heading" className={styles.settingsPanelTitle}>
              Contact Ethos
            </h2>
            <p className={`${styles.settingsHelpText} ${styles.settingsIntroText}`}>
              Tell us what you need help with. Include as much detail as you can about your store
              and products.
            </p>

            <Form method="post" encType="multipart/form-data" className={styles.configureFormStack}>
              <label className={styles.formField}>
                <span className={styles.formFieldLabel}>Name</span>
                <input
                  type="text"
                  name="name"
                  required
                  autoComplete="name"
                  className={styles.field}
                  placeholder="Your name"
                />
              </label>
              <label className={styles.formField}>
                <span className={styles.formFieldLabel}>Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  className={styles.field}
                  placeholder="you@company.com"
                />
              </label>
              <label className={styles.formField}>
                <span className={styles.formFieldLabel}>Company Phone</span>
                <input
                  type="tel"
                  name="companyPhone"
                  autoComplete="tel"
                  className={styles.field}
                  placeholder="+1 (555) 123-4567"
                />
              </label>
              <label className={styles.formField}>
                <span className={styles.formFieldLabel}>Message</span>
                <textarea
                  name="message"
                  required
                  minLength={10}
                  rows={6}
                  className={styles.fieldTextarea}
                  placeholder="Describe your question or issue…"
                />
              </label>
              <ContactAttachmentField
                disabled={submitting}
                onError={setAttachmentError}
              />
              {attachmentError ? (
                <p className={styles.formError}>{attachmentError}</p>
              ) : null}
              <div className={styles.settingsActions}>
                <button
                  type="submit"
                  className={styles.primarySubmitButton}
                  disabled={submitting}
                >
                  {submitting ? "Sending…" : "Send Message"}
                </button>
              </div>
            </Form>

            <p className={styles.settingsHelpText}>
              <a href={`mailto:${supportEmail}`} className={styles.inlineTextLink}>
                {supportEmail}
              </a>
            </p>
            <p className={styles.settingsHelpText}>
              Prefer to call us?{" "}
              <a href="tel:+17606972854" className={styles.inlineTextLink}>
                +1 (760) 697-2854
              </a>{" "}
              · M–F 9am–3pm PST
            </p>
          </section>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
