import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouteActionFetcher } from "../lib/use-route-action-fetcher";
import { EmbeddedAppErrorBoundary } from "../components/embedded-app-error-boundary";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  deleteProductAttachment,
  listProductAttachments,
  toClientProductAttachment,
  type ClientProductAttachment,
} from "../lib/attachments.server";
import { MOCK_CATALOG_PRODUCTS } from "../lib/mock-catalog";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { fetchProductSummariesByGids } from "../lib/shopify/products.server";
import { fetchConfigureVariants } from "../lib/shopify/variants.server";
import { Decimal } from "@prisma/client/runtime/library";
import {
  ATTACHMENT_CATEGORIES,
  isAllowedDesignUpload,
  MAX_ATTACHMENT_BYTES,
  type AttachmentCategory,
} from "../lib/upload-constants";
import {
  getMerchantS3ConfigError,
  isMerchantS3Configured,
  isValidMerchantAttachmentKey,
  merchantAttachmentStorageKey,
  putPrivateObject,
} from "../lib/s3.server";

function productGidFromRequest(request: Request): string | null {
  const params = new URL(request.url).searchParams;
  const gid = params.get("productGid")?.trim() || params.get("productId")?.trim();
  return gid || null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const shopifyProductGid = productGidFromRequest(request);
  if (!shopifyProductGid) {
    throw new Response("Missing productGid", { status: 400 });
  }

  const selection = await prisma.productSelection.findUnique({
    where: {
      shopDomain_shopifyProductGid: {
        shopDomain: ctx.shopDomain,
        shopifyProductGid,
      },
    },
    include: { variantSelections: true },
  });
  if (!selection) {
    throw new Response("Product is not in your selection", { status: 404 });
  }

  let configureVariants: Array<{
    shopifyVariantGid: string;
    title: string;
    sku: string | null;
    shopifyPrice: string;
    ethosPrice: string | null;
    selected: boolean;
  }> = [];

  if (ctx.mode === "shopify" && ctx.admin) {
    const { variants } = await fetchConfigureVariants(ctx.admin, shopifyProductGid);
    const priceByGid = new Map(
      selection.variantSelections.map((v) => [v.shopifyVariantGid, v.ethosPrice?.toString() ?? null]),
    );
    const selectedByGid = new Map(
      selection.variantSelections.map((v) => [v.shopifyVariantGid, v.selected]),
    );
    configureVariants = variants.map((v) => ({
      shopifyVariantGid: v.id,
      title: v.title,
      sku: v.sku,
      shopifyPrice: v.shopifyPrice,
      ethosPrice: priceByGid.get(v.id) ?? null,
      selected: selectedByGid.has(v.id) ? Boolean(selectedByGid.get(v.id)) : true,
    }));
  } else {
    configureVariants = selection.variantSelections.map((v) => ({
      shopifyVariantGid: v.shopifyVariantGid,
      title: v.shopifyVariantGid,
      sku: null,
      shopifyPrice: "—",
      ethosPrice: v.ethosPrice?.toString() ?? null,
      selected: v.selected,
    }));
  }

  const attachments = await listProductAttachments(ctx.shopDomain, shopifyProductGid);
  const mock = MOCK_CATALOG_PRODUCTS.find((p) => p.id === shopifyProductGid);
  const live =
    ctx.mode === "shopify" && ctx.admin
      ? (await fetchProductSummariesByGids(ctx.admin, [shopifyProductGid])).get(shopifyProductGid)
      : undefined;

  return {
    shopifyProductGid,
    title: live?.title ?? mock?.title ?? shopifyProductGid,
    attachments: attachments.map(toClientProductAttachment),
    s3Configured: isMerchantS3Configured() || ctx.mode === "preview",
    categories: ATTACHMENT_CATEGORIES,
    maxBytes: MAX_ATTACHMENT_BYTES,
    variants: configureVariants,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireMerchantContext(request);
  const shopifyProductGid = productGidFromRequest(request);
  if (!shopifyProductGid) {
    return Response.json({ ok: false, error: "Missing productGid" }, { status: 400 });
  }

  const selection = await prisma.productSelection.findUnique({
    where: {
      shopDomain_shopifyProductGid: {
        shopDomain: ctx.shopDomain,
        shopifyProductGid,
      },
    },
  });
  if (!selection) {
    return Response.json({ ok: false, error: "Product not in selection" }, { status: 404 });
  }

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    const id = String(form.get("attachmentId") ?? "");
    const result = await deleteProductAttachment(ctx.shopDomain, id);
    if (!result.ok) {
      return Response.json(result, { status: 404 });
    }
    return Response.json({ ok: true });
  }

  if (intent === "upload") {
    const uploadFile = form.get("file");
    const isFileLike =
      uploadFile instanceof Blob ||
      (typeof uploadFile === "object" &&
        uploadFile !== null &&
        "arrayBuffer" in uploadFile &&
        typeof (uploadFile as Blob).arrayBuffer === "function");
    if (!isFileLike || uploadFile.size === 0) {
      return Response.json(
        {
          ok: false,
          error:
            typeof uploadFile === "string" && uploadFile.length > 0
              ? "File upload was truncated. Refresh the page and try again."
              : "Choose a file to upload",
        },
        { status: 400 },
      );
    }
    const fileBlob = uploadFile as Blob;

    const filename =
      String(form.get("filename") ?? "").trim() ||
      (fileBlob instanceof File ? fileBlob.name : "upload.bin");
    const contentType =
      String(form.get("contentType") ?? "").trim() ||
      (fileBlob instanceof File ? fileBlob.type : "") ||
      "application/octet-stream";
    const category = String(form.get("category") ?? "other") as AttachmentCategory;
    const label = String(form.get("label") ?? "").trim() || null;
    const byteSize = fileBlob.size;

    if (byteSize > MAX_ATTACHMENT_BYTES) {
      return Response.json(
        { ok: false, error: `File must be at most ${MAX_ATTACHMENT_BYTES} bytes` },
        { status: 400 },
      );
    }
    if (!isAllowedDesignUpload(filename, contentType)) {
      return Response.json(
        { ok: false, error: "Allowed types: PDF, AI, EPS, SVG, PNG, JPG, DOCX" },
        { status: 400 },
      );
    }

    const usePreviewStub = ctx.mode === "preview" && !isMerchantS3Configured();
    const storageKey = usePreviewStub
      ? `local-preview://${ctx.shopDomain}/${encodeURIComponent(shopifyProductGid)}/${Date.now()}-${filename}`
      : merchantAttachmentStorageKey(ctx.shopDomain, shopifyProductGid, filename);

    const attachment = await prisma.productAttachment.create({
      data: {
        shopDomain: ctx.shopDomain,
        shopifyProductGid,
        productSelectionId: selection.id,
        category,
        label,
        storageKey,
        filename,
        contentType,
        byteSize: BigInt(byteSize),
        status: usePreviewStub ? "uploaded" : "pending",
      },
    });

    if (usePreviewStub) {
      return Response.json({ ok: true, attachment: toClientProductAttachment(attachment) });
    }

    const s3ConfigError = getMerchantS3ConfigError();
    if (s3ConfigError) {
      await prisma.productAttachment.update({
        where: { id: attachment.id },
        data: { status: "failed" },
      });
      return Response.json({ ok: false, error: s3ConfigError }, { status: 503 });
    }

    try {
      const body = Buffer.from(await fileBlob.arrayBuffer());
      await putPrivateObject(storageKey, body, contentType);
      const updated = await prisma.productAttachment.update({
        where: { id: attachment.id },
        data: { status: "uploaded" },
      });
      return Response.json({ ok: true, attachment: toClientProductAttachment(updated) });
    } catch (error) {
      console.error("[configure upload] S3 put failed", error);
      await prisma.productAttachment.update({
        where: { id: attachment.id },
        data: { status: "failed" },
      });
      const message =
        error instanceof Error && error.message && !error.message.includes("Invalid character in header")
          ? error.message
          : "Could not upload file to S3. Verify AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and AWS_S3_BUCKET in .env (full keys, no truncation).";
      return Response.json({ ok: false, error: message }, { status: 500 });
    }
  }

  if (intent === "prepare") {
    const filename = String(form.get("filename") ?? "").trim();
    const contentType = String(form.get("contentType") ?? "application/octet-stream").trim();
    const category = String(form.get("category") ?? "other") as AttachmentCategory;
    const label = String(form.get("label") ?? "").trim() || null;
    const byteSize = Number(form.get("byteSize") ?? 0);

    if (!filename) {
      return Response.json({ ok: false, error: "Filename required" }, { status: 400 });
    }
    if (byteSize <= 0 || byteSize > MAX_ATTACHMENT_BYTES) {
      return Response.json(
        { ok: false, error: `File must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes` },
        { status: 400 },
      );
    }
    if (!isAllowedDesignUpload(filename, contentType)) {
      return Response.json(
        {
          ok: false,
          error: "Allowed types: PDF, AI, EPS, SVG, PNG, JPG, DOCX",
        },
        { status: 400 },
      );
    }

    const usePreviewStub = ctx.mode === "preview" && !isMerchantS3Configured();
    const storageKey = usePreviewStub
      ? `local-preview://${ctx.shopDomain}/${encodeURIComponent(shopifyProductGid)}/${Date.now()}-${filename}`
      : merchantAttachmentStorageKey(ctx.shopDomain, shopifyProductGid, filename);

    const attachment = await prisma.productAttachment.create({
      data: {
        shopDomain: ctx.shopDomain,
        shopifyProductGid,
        productSelectionId: selection.id,
        category,
        label,
        storageKey,
        filename,
        contentType,
        byteSize: BigInt(byteSize),
        status: usePreviewStub ? "uploaded" : "pending",
      },
    });

    if (usePreviewStub) {
      return Response.json({
        ok: true,
        attachmentId: attachment.id,
        storageKey,
        skipUpload: true,
      });
    }

    if (!isMerchantS3Configured()) {
      await prisma.productAttachment.update({
        where: { id: attachment.id },
        data: { status: "failed" },
      });
      return Response.json(
        {
          ok: false,
          error: "S3 is not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET.",
        },
        { status: 503 },
      );
    }

    return Response.json({
      ok: false,
      error: "Direct browser S3 upload is disabled. Use intent=upload with multipart file.",
    }, { status: 410 });
  }

  if (intent === "complete") {
    const attachmentId = String(form.get("attachmentId") ?? "");
    const storageKey = String(form.get("storageKey") ?? "");
    const row = await prisma.productAttachment.findFirst({
      where: { id: attachmentId, shopDomain: ctx.shopDomain, shopifyProductGid },
    });
    if (!row) {
      return Response.json({ ok: false, error: "Attachment not found" }, { status: 404 });
    }
    if (row.storageKey !== storageKey) {
      return Response.json({ ok: false, error: "Storage key mismatch" }, { status: 400 });
    }
    if (!isValidMerchantAttachmentKey(ctx.shopDomain, shopifyProductGid, storageKey) && !storageKey.startsWith("local-preview://")) {
      return Response.json({ ok: false, error: "Invalid storage key" }, { status: 400 });
    }
    const updated = await prisma.productAttachment.update({
      where: { id: row.id },
      data: { status: "uploaded" },
    });
    return Response.json({ ok: true, attachment: toClientProductAttachment(updated) });
  }

  if (intent === "fail") {
    const attachmentId = String(form.get("attachmentId") ?? "");
    await prisma.productAttachment.updateMany({
      where: { id: attachmentId, shopDomain: ctx.shopDomain },
      data: { status: "failed" },
    });
    return Response.json({ ok: true });
  }

  if (intent === "save-pricing") {
    const raw = String(form.get("variantPricing") ?? "");
    let rows: Array<{ shopifyVariantGid: string; ethosPrice: string; selected: boolean }>;
    try {
      rows = JSON.parse(raw) as Array<{ shopifyVariantGid: string; ethosPrice: string; selected: boolean }>;
    } catch {
      return Response.json({ ok: false, error: "Invalid pricing payload" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ ok: false, error: "At least one variant is required" }, { status: 400 });
    }

    await prisma.variantSelection.deleteMany({ where: { productSelectionId: selection.id } });

    const data = rows
      .filter((r) => r.selected)
      .map((r) => {
        const priceStr = String(r.ethosPrice ?? "").trim();
        const parsed = priceStr ? Number.parseFloat(priceStr) : NaN;
        return {
          productSelectionId: selection.id,
          shopifyVariantGid: r.shopifyVariantGid,
          selected: true,
          ethosPrice:
            Number.isFinite(parsed) && parsed > 0 ? new Decimal(parsed.toFixed(2)) : null,
        };
      });

    if (data.length === 0) {
      return Response.json({ ok: false, error: "Select at least one variant" }, { status: 400 });
    }

    await prisma.variantSelection.createMany({ data, skipDuplicates: true });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: false, error: "Unknown intent" }, { status: 400 });
};

function categoryLabel(value: string, categories: typeof ATTACHMENT_CATEGORIES): string {
  return categories.find((c) => c.value === value)?.label ?? value;
}

export default function ConfigureSelectedProductPage() {
  const data = useLoaderData<typeof loader>();
  return <ConfigureSelectedProductPageInner key={data.shopifyProductGid} {...data} />;
}

function ConfigureSelectedProductPageInner({
  title,
  attachments: loaderAttachments,
  s3Configured,
  categories,
  maxBytes,
  variants: loaderVariants,
}: Awaited<ReturnType<typeof loader>>) {
  const deleteFetcher = useFetcher();
  const actionFetcher = useRouteActionFetcher<
    | { ok: true; attachment: ClientProductAttachment }
    | { ok: true }
    | { ok: false; error: string }
  >();
  const pricingFetcher = useRouteActionFetcher<{ ok: true } | { ok: false; error: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<AttachmentCategory>("product_design");
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [extraAttachments, setExtraAttachments] = useState<ClientProductAttachment[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [variantRows, setVariantRows] = useState(loaderVariants);
  const [pricingSaved, setPricingSaved] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);

  const attachments = useMemo(() => {
    const fromLoader = loaderAttachments.filter((a) => !removedIds.has(a.id));
    const loaderIds = new Set(fromLoader.map((a) => a.id));
    const extras = extraAttachments.filter((a) => !loaderIds.has(a.id) && !removedIds.has(a.id));
    return [...extras, ...fromLoader];
  }, [extraAttachments, loaderAttachments, removedIds]);

  const runUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Choose a file first.");
      return;
    }
    if (file.size > maxBytes) {
      setUploadError(`File is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).`);
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const uploadFd = new FormData();
      uploadFd.set("intent", "upload");
      uploadFd.set("file", file);
      uploadFd.set("filename", file.name);
      uploadFd.set("contentType", file.type || "application/octet-stream");
      uploadFd.set("category", category);
      if (label.trim()) uploadFd.set("label", label.trim());

      const result = await actionFetcher.submit(uploadFd, { multipart: true });
      if (!result.ok || !("attachment" in result) || !result.attachment) {
        throw new Error("error" in result ? result.error : "Upload failed");
      }

      const attachment = result.attachment;
      setExtraAttachments((prev) => [
        attachment,
        ...prev.filter((a) => a.id !== attachment.id),
      ]);

      if (fileRef.current) fileRef.current.value = "";
      setLabel("");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [actionFetcher, category, label, maxBytes]);

  const savePricing = useCallback(async () => {
    setPricingError(null);
    setPricingSaved(null);
    const payload = variantRows.map((v) => ({
      shopifyVariantGid: v.shopifyVariantGid,
      ethosPrice: v.ethosPrice ?? "",
      selected: v.selected,
    }));
    const fd = new FormData();
    fd.set("intent", "save-pricing");
    fd.set("variantPricing", JSON.stringify(payload));
    try {
      await pricingFetcher.submit(fd);
      setPricingSaved("Pricing saved.");
    } catch (e) {
      setPricingError(e instanceof Error ? e.message : "Could not save pricing");
    }
  }, [pricingFetcher, variantRows]);

  const removeAttachment = useCallback(
    (attachmentId: string) => {
      setRemovedIds((prev) => new Set(prev).add(attachmentId));
      const fd = new FormData();
      fd.set("intent", "delete");
      fd.set("attachmentId", attachmentId);
      void deleteFetcher.submit(fd, { method: "post" });
    },
    [deleteFetcher],
  );

  return (
    <s-page heading="Configure product">
      <s-section heading={title}>
        <s-paragraph>
          <Link to="/app/selected">← Back to selected</Link>
        </s-paragraph>
        <s-paragraph>
          Set Ethos pricing per variant and upload design files. Files stay in S3 until you submit from Selected products.
        </s-paragraph>
        {!s3Configured ? (
          <p style={{ background: "#fff7ed", padding: "8px 12px", borderRadius: "8px", fontSize: "13px" }}>
            S3 credentials are not set — uploads will fail in live mode until AWS env vars are configured.
          </p>
        ) : null}
      </s-section>

      <s-section heading="Ethos pricing (per variant)">
        {variantRows.length === 0 ? (
          <s-paragraph>No variants found for this product.</s-paragraph>
        ) : (
          <>
            <table style={{ width: "100%", maxWidth: "720px", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e4e4e7" }}>
                  <th style={{ padding: "8px 4px" }}>Include</th>
                  <th style={{ padding: "8px 4px" }}>Variant</th>
                  <th style={{ padding: "8px 4px" }}>Shopify price</th>
                  <th style={{ padding: "8px 4px" }}>Ethos price (USD)</th>
                </tr>
              </thead>
              <tbody>
                {variantRows.map((row) => (
                  <tr key={row.shopifyVariantGid} style={{ borderBottom: "1px solid #f4f4f5" }}>
                    <td style={{ padding: "8px 4px" }}>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={(e) =>
                          setVariantRows((prev) =>
                            prev.map((r) =>
                              r.shopifyVariantGid === row.shopifyVariantGid
                                ? { ...r, selected: e.target.checked }
                                : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td style={{ padding: "8px 4px" }}>
                      {row.title}
                      {row.sku ? (
                        <div style={{ color: "#71717a", fontSize: "12px" }}>SKU {row.sku}</div>
                      ) : null}
                    </td>
                    <td style={{ padding: "8px 4px" }}>{row.shopifyPrice}</td>
                    <td style={{ padding: "8px 4px" }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.ethosPrice ?? ""}
                        disabled={!row.selected}
                        onChange={(e) =>
                          setVariantRows((prev) =>
                            prev.map((r) =>
                              r.shopifyVariantGid === row.shopifyVariantGid
                                ? { ...r, ethosPrice: e.target.value }
                                : r,
                            ),
                          )
                        }
                        style={{ width: "120px" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "12px", display: "flex", gap: "12px", alignItems: "center" }}>
              <button
                type="button"
                disabled={pricingFetcher.isSubmitting}
                onClick={() => void savePricing()}
              >
                {pricingFetcher.isSubmitting ? "Saving…" : "Save pricing"}
              </button>
              {pricingSaved ? (
                <span style={{ color: "#15803d", fontSize: "13px" }}>{pricingSaved}</span>
              ) : null}
              {pricingError ? (
                <span style={{ color: "#b91c1c", fontSize: "13px" }}>{pricingError}</span>
              ) : null}
            </div>
          </>
        )}
      </s-section>

      <s-section heading="Upload design file">
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "480px" }}>
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AttachmentCategory)}
              style={{ display: "block", marginTop: "4px", width: "100%" }}
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Label (optional)
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Spring 2026 chest print"
              style={{ display: "block", marginTop: "4px", width: "100%" }}
            />
          </label>
          <label>
            File
            <input ref={fileRef} type="file" style={{ display: "block", marginTop: "4px" }} />
          </label>
          <button type="button" disabled={uploading || actionFetcher.isSubmitting} onClick={() => void runUpload()}>
            {uploading || actionFetcher.isSubmitting ? "Uploading…" : "Upload to S3"}
          </button>
          {uploadError ? (
            <p style={{ color: "#b91c1c", margin: 0, fontSize: "13px" }}>{uploadError}</p>
          ) : null}
        </div>
      </s-section>

      <s-section heading="Uploaded files">
        {attachments.length === 0 ? (
          <s-paragraph>No attachments yet.</s-paragraph>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {attachments.map((a) => (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <div>
                  <strong>{a.filename}</strong>
                  <div style={{ fontSize: "12px", color: "#71717a" }}>
                    {categoryLabel(a.category, categories)}
                    {a.label ? ` · ${a.label}` : ""} · {a.status}
                  </div>
                </div>
                <button type="button" onClick={() => removeAttachment(a.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return <EmbeddedAppErrorBoundary heading="Configure product" />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

/** Avoid post-action loader refetch in embedded Admin (session token bounce → blank page). */
export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (formAction?.includes("/app/selected/configure")) {
    return false;
  }
  return defaultShouldRevalidate;
}
