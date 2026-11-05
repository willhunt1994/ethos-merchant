import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouteActionFetcher } from "../lib/use-route-action-fetcher";
import { EmbeddedAppErrorBoundary } from "../components/embedded-app-error-boundary";
import { PdfDropzonePreview } from "../components/embedded/pdf-dropzone-preview";
import { ConfigOptionTag } from "../components/embedded/config-check-item";
import { CustomizationTypeMedia } from "../components/embedded/customization-type-media";
import {
  SpreadsheetTierMargin,
  VariantTableMargin,
} from "../components/embedded/spreadsheet-tier-margin";
import { UploadedAttachmentPreview } from "../components/embedded/uploaded-attachment-preview";
import { renderPdfPageDataUrls } from "../lib/pdf-preview.client";
import styles from "../styles/embedded-app.module.css";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import {
  deleteProductAttachment,
  listProductAttachments,
  toClientProductAttachment,
  type ClientProductAttachment,
} from "../lib/attachments.server";
import { PLACEHOLDER_IMAGE } from "../lib/catalog-product";
import {
  findMockCatalogProduct,
  findMockCatalogVariant,
  MOCK_CATALOG_PRODUCTS,
} from "../lib/mock-catalog";
import { requireMerchantContext } from "../lib/merchant-auth.server";
import { fetchProductSummariesByGids } from "../lib/shopify/products.server";
import { fetchConfigureVariants } from "../lib/shopify/variants.server";
import { Decimal } from "@prisma/client/runtime/library";
import {
  ATTACHMENT_CATEGORIES,
  extensionFromFilename,
  isAllowedConfigureDesignUpload,
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
import {
  emptyQuantityTierPriceStrings,
  primaryEthosPriceFromTierStrings,
  quantityTierStringsFromStorage,
  quantityTierStringsToJson,
  remapQuantityTierPriceStrings,
} from "../lib/quantity-pricing";
import { quantityBreakTiersForProduct } from "../lib/quantity-tier-definitions";
import { getShopQuantityBreakTiers } from "../lib/shop-quantity-tiers.server";
import {
  defaultGoalMarginPercentsForTierCount,
  parseGoalMarginPercentInput,
  suggestedTierPricesForVariant,
} from "../lib/quantity-tier-goal-margins";
import {
  parseCustomizationTypeIds,
  PRODUCT_CUSTOMIZATION_TYPES,
  type ProductCustomizationTypeId,
  CUSTOMIZATION_TYPE_FEE_NOTE,
  CUSTOMIZATION_TYPE_SELECTION_INTRO,
  customizationTypeCardInfoLines,
  hasRequiredCustomizationTypes,
} from "../lib/product-customization-types";

export type ConfigureVariantRow = {
  shopifyVariantGid: string;
  title: string;
  sku: string | null;
  shopifyPrice: string;
  ethosPrice: string | null;
  quantityTierPrices: string[];
  selected: boolean;
};

function normalizedEthosPriceKey(ethosPrice: string | null | undefined): string | null {
  const trimmed = String(ethosPrice ?? "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (Number.isFinite(n)) return n.toFixed(2);
  return trimmed;
}

/** True when every selected variant has the same non-empty Ethos price (or ≤1 selected). */
function selectedVariantsShareSameEthosPrice(rows: ConfigureVariantRow[]): boolean {
  const selected = rows.filter((r) => r.selected);
  if (selected.length <= 1) return true;
  const keys = selected.map((r) => normalizedEthosPriceKey(r.ethosPrice));
  if (keys.some((k) => k == null)) return false;
  return keys.every((k) => k === keys[0]);
}

function customizationTypeIdsEqual(
  a: ProductCustomizationTypeId[],
  b: ProductCustomizationTypeId[],
): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, index) => id === right[index]);
}

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

  const shopQuantityBreakTiers = await getShopQuantityBreakTiers(ctx.shopDomain);
  const useCustomQuantityBreaks = selection.useCustomQuantityBreaks;
  const quantityBreakTiers = quantityBreakTiersForProduct(
    useCustomQuantityBreaks,
    shopQuantityBreakTiers,
  );

  const storedByGid = new Map(
    selection.variantSelections.map((v) => [
      v.shopifyVariantGid,
      {
        ethosPrice: v.ethosPrice?.toString() ?? null,
        quantityTierPrices: quantityTierStringsFromStorage(
          v.ethosQuantityPricing,
          v.ethosPrice?.toString() ?? null,
          quantityBreakTiers,
        ),
        selected: v.selected,
      },
    ]),
  );
  const selectedByGid = new Map(
    selection.variantSelections.map((v) => [v.shopifyVariantGid, v.selected]),
  );

  function rowFromSources(
    variantGid: string,
    meta: { title: string; sku: string | null; shopifyPrice: string },
  ): ConfigureVariantRow {
    const stored = storedByGid.get(variantGid);
    const quantityTierPrices =
      stored?.quantityTierPrices ?? emptyQuantityTierPriceStrings(quantityBreakTiers);
    const ethosPrice =
      primaryEthosPriceFromTierStrings(quantityTierPrices, quantityBreakTiers) ||
      stored?.ethosPrice ||
      null;
    return {
      shopifyVariantGid: variantGid,
      title: meta.title,
      sku: meta.sku,
      shopifyPrice: meta.shopifyPrice,
      ethosPrice,
      quantityTierPrices,
      selected: selectedByGid.has(variantGid) ? Boolean(selectedByGid.get(variantGid)) : true,
    };
  }

  let configureVariants: ConfigureVariantRow[] = [];

  if (ctx.mode === "shopify" && ctx.admin) {
    const { variants } = await fetchConfigureVariants(ctx.admin, shopifyProductGid);
    configureVariants = variants.map((v) =>
      rowFromSources(v.id, { title: v.title, sku: v.sku, shopifyPrice: v.shopifyPrice }),
    );
  } else {
    const mockProduct = findMockCatalogProduct(shopifyProductGid);
    if (mockProduct) {
      configureVariants = mockProduct.variants.map((v) =>
        rowFromSources(v.id, {
          title: v.title,
          sku: v.sku,
          shopifyPrice: v.unitCost,
        }),
      );
    } else {
      configureVariants = selection.variantSelections.map((v) => {
        const mockVariant = findMockCatalogVariant(v.shopifyVariantGid);
        return rowFromSources(v.shopifyVariantGid, {
          title: mockVariant?.title ?? v.shopifyVariantGid,
          sku: mockVariant?.sku ?? null,
          shopifyPrice: mockVariant?.unitCost ?? "—",
        });
      });
    }
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
    imageUrl: live?.imageUrl ?? mock?.imageUrl ?? null,
    offerCustomization: selection.offerCustomization,
    offerQuantityDiscounts: selection.offerQuantityDiscounts,
    customizationTypeIds: parseCustomizationTypeIds(selection.customizationTypeIds),
    attachments: attachments.map(toClientProductAttachment),
    s3Configured: isMerchantS3Configured() || ctx.mode === "preview",
    categories: ATTACHMENT_CATEGORIES,
    maxBytes: MAX_ATTACHMENT_BYTES,
    variants: configureVariants,
    quantityBreakTiers,
    shopQuantityBreakTiers,
    useCustomQuantityBreaks,
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
    const category = String(form.get("category") ?? "product_design") as AttachmentCategory;
    const label = String(form.get("label") ?? "").trim();
    const byteSize = fileBlob.size;

    if (!label) {
      return Response.json({ ok: false, error: "Label is required" }, { status: 400 });
    }

    if (byteSize > MAX_ATTACHMENT_BYTES) {
      return Response.json(
        { ok: false, error: `File must be at most ${MAX_ATTACHMENT_BYTES} bytes` },
        { status: 400 },
      );
    }
    if (!isAllowedConfigureDesignUpload(filename)) {
      return Response.json(
        { ok: false, error: "PDF or AI files only please" },
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

  if (intent === "save-customization") {
    const raw = String(form.get("offerCustomization") ?? "").trim().toLowerCase();
    const offerCustomization = raw === "yes" || raw === "true" || raw === "1";
    await prisma.productSelection.update({
      where: { id: selection.id },
      data: { offerCustomization },
    });
    return Response.json({ ok: true, offerCustomization });
  }

  if (intent === "save-quantity-discounts") {
    const raw = String(form.get("offerQuantityDiscounts") ?? "").trim().toLowerCase();
    const offerQuantityDiscounts = raw === "yes" || raw === "true" || raw === "1";
    await prisma.productSelection.update({
      where: { id: selection.id },
      data: { offerQuantityDiscounts },
    });
    return Response.json({ ok: true, offerQuantityDiscounts });
  }

  if (intent === "save-quantity-break-mode") {
    const useCustomQuantityBreaks = String(form.get("useCustomQuantityBreaks") ?? "") === "yes";
    await prisma.productSelection.update({
      where: { id: selection.id },
      data: { useCustomQuantityBreaks },
    });
    return Response.json({ ok: true, useCustomQuantityBreaks });
  }

  if (intent === "save-customization-types") {
    const raw = String(form.get("customizationTypeIds") ?? "[]");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return Response.json({ ok: false, error: "Invalid customization types" }, { status: 400 });
    }
    const customizationTypeIds = parseCustomizationTypeIds(parsed);
    await prisma.productSelection.update({
      where: { id: selection.id },
      data: { customizationTypeIds },
    });
    return Response.json({ ok: true, customizationTypeIds });
  }

  if (intent === "save-customization-settings") {
    const rawOffer = String(form.get("offerCustomization") ?? "").trim().toLowerCase();
    const offerCustomization =
      rawOffer === "yes" || rawOffer === "true" || rawOffer === "1";
    const rawTypes = String(form.get("customizationTypeIds") ?? "[]");
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawTypes) as unknown;
    } catch {
      return Response.json({ ok: false, error: "Invalid customization types" }, { status: 400 });
    }
    const customizationTypeIds = parseCustomizationTypeIds(parsed);
    if (offerCustomization && customizationTypeIds.length === 0) {
      return Response.json(
        { ok: false, error: "Select at least one customization type." },
        { status: 400 },
      );
    }
    await prisma.productSelection.update({
      where: { id: selection.id },
      data: { offerCustomization, customizationTypeIds },
    });
    return Response.json({ ok: true, offerCustomization, customizationTypeIds });
  }

  if (intent === "save-pricing") {
    const raw = String(form.get("variantPricing") ?? "");
    let rows: Array<{
      shopifyVariantGid: string;
      ethosPrice: string;
      selected: boolean;
      quantityTierPrices?: string[];
    }>;
    try {
      rows = JSON.parse(raw) as Array<{
        shopifyVariantGid: string;
        ethosPrice: string;
        selected: boolean;
        quantityTierPrices?: string[];
      }>;
    } catch {
      return Response.json({ ok: false, error: "Invalid pricing payload" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ ok: false, error: "At least one variant is required" }, { status: 400 });
    }

    const shopQuantityBreakTiers = await getShopQuantityBreakTiers(ctx.shopDomain);
    const quantityBreakTiers = quantityBreakTiersForProduct(
      selection.useCustomQuantityBreaks,
      shopQuantityBreakTiers,
    );

    await prisma.variantSelection.deleteMany({ where: { productSelectionId: selection.id } });

    const data = rows
      .filter((r) => r.selected)
      .map((r) => {
        const tierStrings =
          r.quantityTierPrices?.length === quantityBreakTiers.length
            ? r.quantityTierPrices
            : emptyQuantityTierPriceStrings(quantityBreakTiers);
        const primary =
          primaryEthosPriceFromTierStrings(tierStrings, quantityBreakTiers) ||
          String(r.ethosPrice ?? "").trim();
        const parsed = primary ? Number.parseFloat(primary) : NaN;
        return {
          productSelectionId: selection.id,
          shopifyVariantGid: r.shopifyVariantGid,
          selected: true,
          ethosPrice:
            Number.isFinite(parsed) && parsed > 0 ? new Decimal(parsed.toFixed(2)) : null,
          ethosQuantityPricing: quantityTierStringsToJson(tierStrings, quantityBreakTiers),
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

function attachmentStatusTagClass(status: string): string {
  switch (status) {
    case "uploaded":
      return styles.attachmentStatusTagSuccess;
    case "failed":
      return styles.attachmentStatusTagDanger;
    default:
      return styles.attachmentStatusTagNeutral;
  }
}

function attachmentStatusLabel(status: string): string {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    default:
      return status;
  }
}

function parseMoney(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "—") return null;
  const n = Number(trimmed.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatShopifyPriceDisplay(shopifyPrice: string): string {
  const amount = parseMoney(shopifyPrice);
  return amount != null ? formatUsd(amount) : shopifyPrice;
}

function pendingFilePreviewKind(file: File): "image" | "pdf" | "document" {
  if (file.type.startsWith("image/")) return "image";
  const ext = extensionFromFilename(file.name);
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  return "document";
}

export default function ConfigureSelectedProductPage() {
  const data = useLoaderData<typeof loader>();
  return <ConfigureSelectedProductPageInner key={data.shopifyProductGid} {...data} />;
}

function ConfigureSelectedProductPageInner({
  title,
  imageUrl,
  offerCustomization: loaderOfferCustomization,
  offerQuantityDiscounts: loaderOfferQuantityDiscounts,
  customizationTypeIds: loaderCustomizationTypeIds,
  attachments: loaderAttachments,
  s3Configured,
  maxBytes,
  variants: loaderVariants,
  quantityBreakTiers: loaderQuantityBreakTiers,
  shopQuantityBreakTiers,
  useCustomQuantityBreaks: loaderUseCustomQuantityBreaks,
}: Awaited<ReturnType<typeof loader>>) {
  const deleteFetcher = useFetcher();
  const customizationFetcher = useRouteActionFetcher<
    { ok: true; offerCustomization: boolean } | { ok: false; error: string }
  >();
  const quantityDiscountsFetcher = useRouteActionFetcher<
    { ok: true; offerQuantityDiscounts: boolean } | { ok: false; error: string }
  >();
  const quantityBreakModeFetcher = useRouteActionFetcher<
    { ok: true; useCustomQuantityBreaks: boolean } | { ok: false; error: string }
  >();
  const customizationTypesFetcher = useRouteActionFetcher<
    | {
        ok: true;
        customizationTypeIds: ProductCustomizationTypeId[];
        offerCustomization?: boolean;
      }
    | { ok: false; error: string }
  >();
  const actionFetcher = useRouteActionFetcher<
    | { ok: true; attachment: ClientProductAttachment }
    | { ok: true }
    | { ok: false; error: string }
  >();
  const pricingFetcher = useRouteActionFetcher<{ ok: true } | { ok: false; error: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const category: AttachmentCategory = "product_design";
  const [label, setLabel] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [samePriceForAll, setSamePriceForAll] = useState(false);
  const [extraAttachments, setExtraAttachments] = useState<ClientProductAttachment[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [variantRows, setVariantRows] = useState(loaderVariants);
  const [useCustomQuantityBreaks, setUseCustomQuantityBreaks] = useState(
    loaderUseCustomQuantityBreaks,
  );
  const quantityBreakTiers = useMemo(
    () => quantityBreakTiersForProduct(useCustomQuantityBreaks, shopQuantityBreakTiers),
    [useCustomQuantityBreaks, shopQuantityBreakTiers],
  );
  const [tierGoalMarginPercents, setTierGoalMarginPercents] = useState(() =>
    defaultGoalMarginPercentsForTierCount(loaderQuantityBreakTiers.length),
  );
  const skipInitialSuggestedApply = useRef(
    loaderVariants.some((v) =>
      v.quantityTierPrices.some((p) => String(p ?? "").trim() !== ""),
    ),
  );
  const [useSuggestedQuantityPricing, setUseSuggestedQuantityPricing] = useState(true);
  const [pricingSaved, setPricingSaved] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [customizationError, setCustomizationError] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [offerCustomization, setOfferCustomization] = useState(loaderOfferCustomization);
  const [offerQuantityDiscounts, setOfferQuantityDiscounts] = useState(
    loaderOfferQuantityDiscounts,
  );
  const [customizationTypeIds, setCustomizationTypeIds] = useState(loaderCustomizationTypeIds);
  const [savedCustomizationTypeIds, setSavedCustomizationTypeIds] = useState(
    loaderCustomizationTypeIds,
  );
  const [attachmentPreviewById, setAttachmentPreviewById] = useState<Record<string, string>>(
    {},
  );

  const setOfferCustomizationChoice = useCallback(
    (enabled: boolean) => {
      setOfferCustomization(enabled);
      if (!enabled) {
        setCustomizationTypeIds([]);
        setSavedCustomizationTypeIds([]);
      }
      const fd = new FormData();
      fd.set("intent", "save-customization");
      fd.set("offerCustomization", enabled ? "yes" : "no");
      void customizationFetcher.submit(fd);
      if (!enabled) {
        const typesFd = new FormData();
        typesFd.set("intent", "save-customization-types");
        typesFd.set("customizationTypeIds", "[]");
        void customizationTypesFetcher.submit(typesFd);
      }
    },
    [customizationFetcher, customizationTypesFetcher],
  );

  const setOfferQuantityDiscountsChoice = useCallback(
    (enabled: boolean) => {
      setOfferQuantityDiscounts(enabled);
      const fd = new FormData();
      fd.set("intent", "save-quantity-discounts");
      fd.set("offerQuantityDiscounts", enabled ? "yes" : "no");
      void quantityDiscountsFetcher.submit(fd);
    },
    [quantityDiscountsFetcher],
  );

  const toggleCustomizationType = useCallback((typeId: ProductCustomizationTypeId) => {
    setCustomizationError(null);
    setCustomizationTypeIds((prev) =>
      prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId],
    );
  }, []);

  const customizationTypesDirty = useMemo(
    () => !customizationTypeIdsEqual(customizationTypeIds, savedCustomizationTypeIds),
    [customizationTypeIds, savedCustomizationTypeIds],
  );

  const customizationSaveButtonLabel = customizationTypesFetcher.isSubmitting
    ? "Saving…"
    : !customizationTypesDirty && customizationTypeIds.length > 0
      ? "Saved"
      : "Save Customization";

  const saveCustomization = useCallback(async () => {
    if (!hasRequiredCustomizationTypes(offerCustomization, customizationTypeIds)) {
      setCustomizationError("Select at least one customization type.");
      return;
    }
    setCustomizationError(null);
    const fd = new FormData();
    fd.set("intent", "save-customization-settings");
    fd.set("offerCustomization", offerCustomization ? "yes" : "no");
    fd.set("customizationTypeIds", JSON.stringify(customizationTypeIds));
    try {
      const data = await customizationTypesFetcher.submit(fd);
      setSavedCustomizationTypeIds(parseCustomizationTypeIds(data.customizationTypeIds));
      setCustomizationError(null);
    } catch (err) {
      setCustomizationError(err instanceof Error ? err.message : "Could not save customization.");
    }
  }, [offerCustomization, customizationTypeIds, customizationTypesFetcher]);

  const customizationTypesMissing =
    offerCustomization && !hasRequiredCustomizationTypes(true, customizationTypeIds);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const setPendingUploadFile = useCallback((file: File | null) => {
    if (file && !isAllowedConfigureDesignUpload(file.name)) {
      setUploadError("PDF or AI files only please");
      return;
    }
    setUploadError(null);
    setPendingFile(file);
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (!file) return null;
      return URL.createObjectURL(file);
    });
  }, []);

  const pendingPreviewKind = pendingFile ? pendingFilePreviewKind(pendingFile) : null;

  const hasAnyVariantPrice = variantRows.some((r) => {
    if (!r.selected) return false;
    if (offerQuantityDiscounts) {
      return r.quantityTierPrices.some((p) => String(p ?? "").trim() !== "");
    }
    return r.ethosPrice != null && String(r.ethosPrice).trim() !== "";
  });

  const allSelectedShareSameEthosPrice = useMemo(
    () => selectedVariantsShareSameEthosPrice(variantRows),
    [variantRows],
  );

  useEffect(() => {
    if (allSelectedShareSameEthosPrice && samePriceForAll) {
      setSamePriceForAll(false);
    }
  }, [allSelectedShareSameEthosPrice, samePriceForAll]);

  const samePriceForAllControl =
    hasAnyVariantPrice && !allSelectedShareSameEthosPrice ? (
    <label className={styles.samePriceOptionHeader}>
      <input
        type="checkbox"
        checked={samePriceForAll}
        onChange={(e) => {
          const enabled = e.target.checked;
          setSamePriceForAll(enabled);
          if (enabled) {
            const template = variantRows.find((r) => {
              if (!r.selected) return false;
              if (offerQuantityDiscounts) {
                return r.quantityTierPrices.some((p) => String(p ?? "").trim() !== "");
              }
              return r.ethosPrice != null && String(r.ethosPrice).trim() !== "";
            });
            if (template) {
              setVariantRows((prev) =>
                prev.map((r) =>
                  r.selected
                    ? applyPricingToRow(
                        r,
                        template.ethosPrice ?? "",
                        [...template.quantityTierPrices],
                      )
                    : r,
                ),
              );
            }
          }
        }}
      />
      Same for all selected variants
    </label>
  ) : null;

  const applyPricingToRow = useCallback(
    (row: ConfigureVariantRow, ethosPrice: string, quantityTierPrices: string[]): ConfigureVariantRow => ({
      ...row,
      ethosPrice,
      quantityTierPrices,
    }),
    [],
  );

  const applySuggestedPricingToVariants = useCallback(
    (goalMargins: number[]) => {
      setVariantRows((prev) =>
        prev.map((r) => {
          if (!r.selected) return r;
          const tiers = suggestedTierPricesForVariant(r.shopifyPrice, goalMargins);
          const ethosPrice =
            primaryEthosPriceFromTierStrings(tiers, quantityBreakTiers) || tiers[0] || "";
          return applyPricingToRow(r, ethosPrice, tiers);
        }),
      );
    },
    [applyPricingToRow, quantityBreakTiers],
  );

  const setGoalMarginsAndApplyPrices = useCallback(
    (next: number[]) => {
      setTierGoalMarginPercents(next);
      if (offerQuantityDiscounts) {
        applySuggestedPricingToVariants(next);
      }
    },
    [offerQuantityDiscounts, applySuggestedPricingToVariants],
  );

  const setQuantityBreakModeChoice = useCallback(
    (custom: boolean) => {
      if (custom === useCustomQuantityBreaks) return;
      const fromTiers = quantityBreakTiersForProduct(useCustomQuantityBreaks, shopQuantityBreakTiers);
      const toTiers = quantityBreakTiersForProduct(custom, shopQuantityBreakTiers);
      setUseCustomQuantityBreaks(custom);
      setVariantRows((prev) =>
        prev.map((r) => {
          const tiers = remapQuantityTierPriceStrings(r.quantityTierPrices, fromTiers, toTiers);
          const ethosPrice =
            primaryEthosPriceFromTierStrings(tiers, toTiers) || r.ethosPrice || "";
          return applyPricingToRow(r, ethosPrice, tiers);
        }),
      );
      setTierGoalMarginPercents(defaultGoalMarginPercentsForTierCount(toTiers.length));
      const fd = new FormData();
      fd.set("intent", "save-quantity-break-mode");
      fd.set("useCustomQuantityBreaks", custom ? "yes" : "no");
      void quantityBreakModeFetcher.submit(fd);
    },
    [
      useCustomQuantityBreaks,
      shopQuantityBreakTiers,
      applyPricingToRow,
      quantityBreakModeFetcher,
    ],
  );

  const updateVariantPrice = useCallback(
    (shopifyVariantGid: string, ethosPrice: string) => {
      setVariantRows((prev) => {
        const apply = (r: ConfigureVariantRow) => {
          const tiers = [...r.quantityTierPrices];
          tiers[0] = ethosPrice;
          return applyPricingToRow(r, ethosPrice, tiers);
        };
        if (samePriceForAll) {
          return prev.map((r) => (r.selected ? apply(r) : r));
        }
        return prev.map((r) => (r.shopifyVariantGid === shopifyVariantGid ? apply(r) : r));
      });
    },
    [applyPricingToRow, samePriceForAll],
  );

  const updateQuantityTierPrice = useCallback(
    (shopifyVariantGid: string, tierIndex: number, price: string) => {
      setVariantRows((prev) => {
        const apply = (r: ConfigureVariantRow) => {
          const tiers = [...r.quantityTierPrices];
          tiers[tierIndex] = price;
          const ethosPrice =
            tierIndex === 0 ? price : primaryEthosPriceFromTierStrings(tiers) || r.ethosPrice;
          return applyPricingToRow(r, ethosPrice ?? "", tiers);
        };
        if (samePriceForAll) {
          return prev.map((r) => (r.selected ? apply(r) : r));
        }
        return prev.map((r) => (r.shopifyVariantGid === shopifyVariantGid ? apply(r) : r));
      });
    },
    [applyPricingToRow, samePriceForAll],
  );

  const [tierApplyOffer, setTierApplyOffer] = useState<{ tierIndex: number; price: string } | null>(
    null,
  );

  const handleQuantityTierCellChange = useCallback(
    (shopifyVariantGid: string, tierIndex: number, price: string) => {
      updateQuantityTierPrice(shopifyVariantGid, tierIndex, price);
      const trimmed = price.trim();
      if (trimmed) {
        setTierApplyOffer({ tierIndex, price: trimmed });
      } else {
        setTierApplyOffer((prev) => (prev?.tierIndex === tierIndex ? null : prev));
      }
    },
    [updateQuantityTierPrice],
  );

  const applyTierPriceToAllSelectedVariants = useCallback(() => {
    if (!tierApplyOffer) return;
    const { tierIndex, price } = tierApplyOffer;
    setVariantRows((prev) =>
      prev.map((r) => {
        if (!r.selected) return r;
        const tiers = [...r.quantityTierPrices];
        tiers[tierIndex] = price;
        const ethosPrice =
          tierIndex === 0
            ? price
            : primaryEthosPriceFromTierStrings(tiers) || r.ethosPrice || "";
        return applyPricingToRow(r, ethosPrice, tiers);
      }),
    );
    setTierApplyOffer(null);
  }, [tierApplyOffer, applyPricingToRow]);

  useEffect(() => {
    setTierGoalMarginPercents((prev) => {
      if (prev.length === quantityBreakTiers.length) return prev;
      return defaultGoalMarginPercentsForTierCount(quantityBreakTiers.length);
    });
  }, [quantityBreakTiers.length]);

  const selectedVariantKey = useMemo(
    () =>
      variantRows
        .filter((r) => r.selected)
        .map((r) => r.shopifyVariantGid)
        .join("|"),
    [variantRows],
  );

  useEffect(() => {
    if (!offerQuantityDiscounts || !useSuggestedQuantityPricing) return;
    if (skipInitialSuggestedApply.current) {
      skipInitialSuggestedApply.current = false;
      return;
    }
    applySuggestedPricingToVariants(tierGoalMarginPercents);
  }, [
    offerQuantityDiscounts,
    useSuggestedQuantityPricing,
    tierGoalMarginPercents,
    applySuggestedPricingToVariants,
    selectedVariantKey,
  ]);

  const showSameForAllRow = useMemo(() => {
    if (useSuggestedQuantityPricing) return false;
    if (tierApplyOffer) return true;
    const selected = variantRows.filter((r) => r.selected);
    if (selected.length <= 1) return false;
    for (let tierIndex = 0; tierIndex < quantityBreakTiers.length; tierIndex++) {
      const prices = selected.map((r) => String(r.quantityTierPrices[tierIndex] ?? "").trim());
      const filled = prices.filter((p) => p !== "");
      if (filled.length === 0) continue;
      const allFilled = filled.length === selected.length;
      const allMatch = filled.every((p) => p === filled[0]);
      if (!allFilled || !allMatch) return true;
    }
    return false;
  }, [variantRows, quantityBreakTiers, tierApplyOffer, useSuggestedQuantityPricing]);

  const attachments = useMemo(() => {
    const fromLoader = loaderAttachments.filter((a) => !removedIds.has(a.id));
    const loaderIds = new Set(fromLoader.map((a) => a.id));
    const extras = extraAttachments.filter((a) => !loaderIds.has(a.id) && !removedIds.has(a.id));
    return [...extras, ...fromLoader];
  }, [extraAttachments, loaderAttachments, removedIds]);

  const runUpload = useCallback(async () => {
    const file = pendingFile ?? fileRef.current?.files?.[0] ?? null;
    if (!label.trim()) {
      setUploadError("Label is required.");
      return;
    }
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
      uploadFd.set("label", label.trim());

      const result = await actionFetcher.submit(uploadFd, { multipart: true });
      if (!result.ok || !("attachment" in result) || !result.attachment) {
        throw new Error("error" in result ? result.error : "Upload failed");
      }

      const attachment = result.attachment;
      setExtraAttachments((prev) => [
        attachment,
        ...prev.filter((a) => a.id !== attachment.id),
      ]);

      if (file) {
        try {
          const data = new Uint8Array(await file.arrayBuffer());
          const urls = await renderPdfPageDataUrls(data, { maxWidth: 240, maxPages: 1 });
          if (urls[0]) {
            setAttachmentPreviewById((prev) => ({ ...prev, [attachment.id]: urls[0]! }));
          }
        } catch {
          /* preview cache optional */
        }
      }

      if (fileRef.current) fileRef.current.value = "";
      setPendingUploadFile(null);
      setLabel("");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [actionFetcher, category, label, maxBytes, pendingFile, setPendingUploadFile]);

  const savePricing = useCallback(async () => {
    setPricingError(null);
    setPricingSaved(null);
    const payload = variantRows.map((v) => ({
      shopifyVariantGid: v.shopifyVariantGid,
      ethosPrice: v.ethosPrice ?? "",
      quantityTierPrices: v.quantityTierPrices,
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
    <s-page>
      <div className={styles.pageTitleRow}>
        <h1 className={styles.pageHeading}>{title}</h1>
        <Link to="/app/selected" className={styles.settingsButton}>
          Back to Selection
        </Link>
      </div>
      {!s3Configured ? (
        <s-section>
          <s-banner tone="warning" heading="Uploads unavailable">
            S3 credentials are not set — configure AWS env vars before uploading design files.
          </s-banner>
        </s-section>
      ) : null}

      <s-section>
        <div className={styles.sectionStepHeading}>
          <span className={styles.workflowStepNumber} aria-hidden>
            1
          </span>
          <h2 className={styles.sectionTitleConfigure}>Ethos Pricing (Per Variant)</h2>
        </div>
        {variantRows.length === 0 ? (
          <s-paragraph>No variants found for this product.</s-paragraph>
        ) : (
          <div className={styles.configurePricingLayout}>
            <div className={styles.configureProductMedia}>
              <img
                src={imageUrl ?? PLACEHOLDER_IMAGE}
                alt=""
                className={styles.configureProductImage}
              />
            </div>
            <div className={styles.configurePricingMain}>
            <div className={styles.tableWrapFull}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th scope="col">Include</th>
                    <th scope="col">Variant</th>
                    <th scope="col">Shopify Cost</th>
                    {!offerQuantityDiscounts ? (
                      <>
                        <th scope="col" className={styles.ethosPriceHeader}>
                          <span>Price</span>
                          {samePriceForAllControl}
                        </th>
                        <th scope="col">Margin</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {variantRows.map((row) => (
                    <tr key={row.shopifyVariantGid}>
                      <td>
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
                      <td>
                        {row.title}
                        {row.sku ? (
                          <div className={styles.productMeta}>SKU {row.sku}</div>
                        ) : null}
                      </td>
                      <td>{formatShopifyPriceDisplay(row.shopifyPrice)}</td>
                      {!offerQuantityDiscounts ? (
                        <>
                          <td>
                            <div className={styles.priceInputWrap}>
                              <span className={styles.priceInputPrefix} aria-hidden>
                                $
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.ethosPrice ?? ""}
                                disabled={!row.selected}
                                onChange={(e) =>
                                  updateVariantPrice(row.shopifyVariantGid, e.target.value)
                                }
                                className={styles.priceInputField}
                                aria-label={`Price for ${row.title}`}
                              />
                            </div>
                          </td>
                          <td className={styles.marginCell}>
                            <VariantTableMargin
                              shopifyUnitCost={row.shopifyPrice}
                              ethosPrice={row.ethosPrice}
                            />
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>

            <div className={styles.configureQuantityBelow}>
              <div className={styles.quantityPricingPanel}>
                <fieldset className={styles.yesNoFieldset}>
                  <legend className={styles.formFieldLabel}>Offer Quantity Discounts</legend>
                  <div
                    className={styles.yesNoOptions}
                    role="radiogroup"
                    aria-label="Offer Quantity Discounts"
                  >
                    <label className={styles.yesNoOption}>
                      <input
                        type="radio"
                        name="offerQuantityDiscounts"
                        checked={offerQuantityDiscounts}
                        onChange={() => setOfferQuantityDiscountsChoice(true)}
                      />
                      Yes
                    </label>
                    <label className={styles.yesNoOption}>
                      <input
                        type="radio"
                        name="offerQuantityDiscounts"
                        checked={!offerQuantityDiscounts}
                        onChange={() => setOfferQuantityDiscountsChoice(false)}
                      />
                      No
                    </label>
                  </div>
                </fieldset>
                {!offerQuantityDiscounts ? null : variantRows.filter((r) => r.selected).length === 0 ? (
                  <p className={styles.quantityPricingEmpty}>
                    Select at least one variant above to set quantity pricing.
                  </p>
                ) : (
                  <>
                    <fieldset className={styles.quantityBreakModeFieldset}>
                      <legend className={styles.formFieldLabel}>Quantity Break Columns</legend>
                      <div
                        className={styles.yesNoOptions}
                        role="radiogroup"
                        aria-label="Quantity Break Columns"
                      >
                        <label className={styles.yesNoOption}>
                          <input
                            type="radio"
                            name="quantityBreakMode"
                            checked={!useCustomQuantityBreaks}
                            onChange={() => setQuantityBreakModeChoice(false)}
                          />
                          Use Suggested Tiers
                        </label>
                        <label className={styles.yesNoOption}>
                          <input
                            type="radio"
                            name="quantityBreakMode"
                            checked={useCustomQuantityBreaks}
                            onChange={() => setQuantityBreakModeChoice(true)}
                          />
                          Use Custom Tiers
                        </label>
                      </div>
                      <p className={styles.quantityBreakModeHint}>
                        {useCustomQuantityBreaks ? (
                          <>
                            Uses your quantity breaks from{" "}
                            <Link to="/app/settings?section=quantity-tiers">Settings</Link>.
                          </>
                        ) : (
                          <>Use Ethos standard range or choose your own.</>
                        )}
                      </p>
                    </fieldset>
                    <label className={styles.useSuggestedPricingOption}>
                      <input
                        type="checkbox"
                        checked={useSuggestedQuantityPricing}
                        onChange={(e) => setUseSuggestedQuantityPricing(e.target.checked)}
                      />
                      Use Suggested Pricing
                    </label>
                    <div className={`${styles.tableWrapScroll} ${styles.spreadsheetWrap}`}>
                      <table className={styles.quantityDiscountTable}>
                        <thead>
                          <tr>
                            <th scope="col" className={styles.quantityDiscountVariantCol}>
                              Variant
                            </th>
                            {quantityBreakTiers.map((tier) => (
                              <th key={tier.label} scope="col" className={styles.quantityTierHeader}>
                                {tier.label}
                              </th>
                            ))}
                          </tr>
                          <tr className={styles.quantityGoalMarginRow}>
                            <th
                              scope="row"
                              className={`${styles.quantityDiscountVariantCol} ${styles.quantityGoalMarginHeading}`}
                            >
                              Goal Margin
                            </th>
                            {quantityBreakTiers.map((tier, tierIndex) => (
                              <th
                                key={`goal-${tier.minQty}-${tier.maxQty}`}
                                scope="col"
                                className={styles.quantityGoalMarginCell}
                              >
                                <div className={styles.goalMarginInputWrap}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={99.9}
                                    step={0.1}
                                    inputMode="decimal"
                                    className={styles.goalMarginInput}
                                    value={tierGoalMarginPercents[tierIndex] ?? ""}
                                    onChange={(e) => {
                                      const n = Number(e.target.value);
                                      if (!Number.isFinite(n)) return;
                                      setTierGoalMarginPercents((prev) => {
                                        const next = [...prev];
                                        next[tierIndex] = n;
                                        return next;
                                      });
                                    }}
                                    onBlur={(e) => {
                                      const parsed = parseGoalMarginPercentInput(e.target.value);
                                      if (parsed == null) return;
                                      const next = [...tierGoalMarginPercents];
                                      next[tierIndex] = parsed;
                                      setGoalMarginsAndApplyPrices(next);
                                    }}
                                    aria-label={`Goal Margin for ${tier.label}`}
                                  />
                                  <span className={styles.goalMarginSuffix} aria-hidden>
                                    %
                                  </span>
                                </div>
                              </th>
                            ))}
                          </tr>
                          {showSameForAllRow ? (
                            <tr className={styles.quantitySameForAllRow}>
                              <th
                                scope="row"
                                className={`${styles.quantityDiscountVariantCol} ${styles.quantitySameForAllHeading}`}
                              >
                                Same For All
                              </th>
                              {quantityBreakTiers.map((tier, tierIndex) => (
                                <th
                                  key={`same-for-all-${tier.minQty}-${tier.maxQty}`}
                                  scope="col"
                                  className={styles.quantityTierSameForAllCell}
                                >
                                  {tierApplyOffer?.tierIndex === tierIndex ? (
                                    <button
                                      type="button"
                                      className={styles.tierApplyHeaderButton}
                                      onClick={applyTierPriceToAllSelectedVariants}
                                    >
                                      Apply to all variants
                                    </button>
                                  ) : null}
                                </th>
                              ))}
                            </tr>
                          ) : null}
                        </thead>
                        <tbody>
                          {variantRows
                            .filter((r) => r.selected)
                            .map((row) => (
                              <tr key={`qty-${row.shopifyVariantGid}`}>
                                <td className={styles.quantityDiscountVariantCol}>
                                  <div className={styles.quantityVariantName}>{row.title}</div>
                                  {row.sku ? (
                                    <div className={styles.quantityVariantSku}>SKU {row.sku}</div>
                                  ) : null}
                                  <div className={styles.quantityVariantCost}>
                                    Cost price {formatShopifyPriceDisplay(row.shopifyPrice)}
                                  </div>
                                </td>
                                {quantityBreakTiers.map((tier, tierIndex) => (
                                  <td key={tier.label} className={styles.spreadsheetCell}>
                                    <div className={styles.spreadsheetCellInner}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={row.quantityTierPrices[tierIndex] ?? ""}
                                        disabled={useSuggestedQuantityPricing}
                                        onChange={(e) =>
                                          handleQuantityTierCellChange(
                                            row.shopifyVariantGid,
                                            tierIndex,
                                            e.target.value,
                                          )
                                        }
                                        className={styles.spreadsheetCellInput}
                                        aria-label={`${tier.label} for ${row.title}`}
                                        placeholder="0.00"
                                      />
                                      <SpreadsheetTierMargin
                                        shopifyUnitCost={row.shopifyPrice}
                                        tierPrice={row.quantityTierPrices[tierIndex] ?? null}
                                      />
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className={styles.configureActionRow}>
                <s-stack direction="inline" gap="base">
                  <s-button
                    type="button"
                    variant="primary"
                    disabled={pricingFetcher.isSubmitting}
                    onClick={() => void savePricing()}
                  >
                    {pricingFetcher.isSubmitting ? "Saving…" : "Save Pricing"}
                  </s-button>
                  {pricingSaved ? (
                    <span style={{ color: "#15803d", fontSize: "13px" }}>{pricingSaved}</span>
                  ) : null}
                  {pricingError ? (
                    <span style={{ color: "#b91c1c", fontSize: "13px" }}>{pricingError}</span>
                  ) : null}
                </s-stack>
              </div>
            </div>
          </div>
        )}
      </s-section>

      <s-section>
        <div className={styles.sectionStepHeading}>
          <span className={styles.workflowStepNumber} aria-hidden>
            2
          </span>
          <h2 className={styles.sectionTitleConfigure}>Customization</h2>
        </div>
        <fieldset className={styles.yesNoFieldset}>
          <legend className={styles.formFieldLabel}>Offer Customization on this product</legend>
          <div className={styles.yesNoOptions} role="radiogroup" aria-label="Offer customization">
            <label className={styles.yesNoOption}>
              <input
                type="radio"
                name="offerCustomization"
                checked={offerCustomization}
                onChange={() => setOfferCustomizationChoice(true)}
              />
              Yes
            </label>
            <label className={styles.yesNoOption}>
              <input
                type="radio"
                name="offerCustomization"
                checked={!offerCustomization}
                onChange={() => setOfferCustomizationChoice(false)}
              />
              No
            </label>
          </div>
        </fieldset>
        {offerCustomization ? (
          <div
            className={`${styles.customizationTypePanel} ${
              customizationTypesMissing ? styles.customizationTypePanelInvalid : ""
            }`}
          >
            <fieldset className={styles.customizationTypeFieldset}>
              <legend className={styles.customizationTypeLegend}>
                Customization Type{" "}
                <span className={styles.requiredMark} aria-hidden>
                  *
                </span>
              </legend>
              <p className={styles.customizationTypeSubtext}>{CUSTOMIZATION_TYPE_SELECTION_INTRO}</p>
              {customizationTypesMissing ? (
                <p className={styles.formError} role="alert">
                  Select at least one customization type.
                </p>
              ) : null}
              <div className={styles.customizationTypeGrid}>
                {PRODUCT_CUSTOMIZATION_TYPES.map((type) => (
                  <div key={type.id} className={styles.customizationTypeCard}>
                    <CustomizationTypeMedia imageSrc={type.imageSrc} label={type.label} />
                    <span className={styles.customizationTypeLabel}>{type.label}</span>
                    <span
                      id={`customization-type-${type.id}-desc`}
                      className={styles.customizationTypeDescription}
                    >
                      <span className={styles.customizationTypeDescriptionMain}>
                        {type.description}
                      </span>
                      {customizationTypeCardInfoLines(type).map((line) => (
                        <span key={line} className={styles.customizationTypeWorksBest}>
                          <svg
                            className={styles.customizationTypeInfoIcon}
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            aria-hidden
                          >
                            <circle
                              cx="7"
                              cy="7"
                              r="6"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.25"
                            />
                            <path
                              fill="currentColor"
                              d="M6.35 6.15h1.3V10H6.35V6.15zm0-2.1h1.3v1.25H6.35V4.05z"
                            />
                          </svg>
                          <em>{line}</em>
                        </span>
                      ))}
                    </span>
                    <label className={styles.customizationTypeCheckLabel}>
                      <input
                        type="checkbox"
                        className={styles.customizationTypeCardInput}
                        checked={customizationTypeIds.includes(type.id)}
                        onChange={() => toggleCustomizationType(type.id)}
                        aria-label={`Select ${type.label}`}
                        aria-describedby={`customization-type-${type.id}-desc`}
                      />
                      <span className={styles.customizationTypeCardCheck} aria-hidden />
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
            <ConfigOptionTag
              tone="warning"
              multiline
              id="customization-type-fee-note"
            >
              {CUSTOMIZATION_TYPE_FEE_NOTE}
            </ConfigOptionTag>
            <div className={styles.configureActionRow}>
              <s-stack direction="inline" gap="base">
                <s-button
                  type="button"
                  variant={
                    !customizationTypesDirty && customizationTypeIds.length > 0
                      ? "secondary"
                      : "primary"
                  }
                  disabled={
                    customizationTypesFetcher.isSubmitting ||
                    customizationTypeIds.length === 0 ||
                    (!customizationTypesDirty && customizationTypeIds.length > 0)
                  }
                  onClick={() => void saveCustomization()}
                >
                  {customizationSaveButtonLabel}
                </s-button>
                {customizationError ? (
                  <span style={{ color: "#b91c1c", fontSize: "13px" }}>{customizationError}</span>
                ) : null}
              </s-stack>
            </div>
          </div>
        ) : null}
      </s-section>

      <s-section>
        <div className={styles.sectionStepHeading}>
          <span className={styles.workflowStepNumber} aria-hidden>
            3
          </span>
          <div className={styles.sectionStepHeadingText}>
            <h2 className={styles.sectionTitleConfigure}>Upload Design File</h2>
          </div>
        </div>
        {!offerCustomization ? (
          <p className={styles.sectionSubtext}>
            Design files are not required for this product.
          </p>
        ) : (
        <div className={styles.configureFormStack}>
          <p className={styles.sectionSubtext}>
            <a
              href="/example-design-guidance.pdf"
              className={styles.inlineTextLink}
              download="ethos-design-guidance-example.pdf"
            >
              Download example design guidance file
            </a>
          </p>
          <label className={styles.formField}>
            <span className={styles.formFieldLabel}>
              Label <span className={styles.requiredMark} aria-hidden>*</span>
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Spring 2026 chest print"
              className={styles.field}
              required={offerCustomization}
            />
          </label>
          <div
            className={`${styles.dropzone} ${dropActive ? styles.dropzoneActive : ""} ${
              pendingFile ? styles.dropzoneHasFile : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) setPendingUploadFile(file);
            }}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload design file"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.ai,application/pdf,application/postscript,application/vnd.adobe.illustrator"
              className={styles.dropzoneInput}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPendingUploadFile(file);
              }}
            />
            {pendingFile && pendingPreviewUrl ? (
              <div className={styles.dropzonePreviewStack}>
                {pendingPreviewKind === "image" ? (
                  <img
                    src={pendingPreviewUrl}
                    alt=""
                    className={styles.dropzonePreview}
                  />
                ) : pendingPreviewKind === "pdf" ? (
                  <PdfDropzonePreview file={pendingFile} />
                ) : (
                  <div className={styles.dropzoneDocPreview} aria-hidden>
                    {extensionFromFilename(pendingFile.name).toUpperCase()}
                  </div>
                )}
                <div className={styles.dropzoneFileMeta}>
                  <span className={styles.dropzoneFileName}>{pendingFile.name}</span>
                  <span className={styles.dropzoneHint}>
                    {Math.round(pendingFile.size / 1024)} KB · Click or drop to replace
                  </span>
                </div>
              </div>
            ) : (
              <div className={styles.dropzoneEmpty}>
                <span className={styles.dropzoneTitle}>Drag and drop a design file</span>
                <span className={styles.dropzoneHint}>PDF or AI files only please</span>
              </div>
            )}
          </div>
          <div className={styles.uploadFileActions}>
            <s-button
              type="button"
              variant="primary"
              disabled={uploading || actionFetcher.isSubmitting}
              onClick={() => void runUpload()}
            >
              {uploading || actionFetcher.isSubmitting ? "Uploading…" : "Upload File"}
            </s-button>
          </div>
          {uploadError ? (
            <p className={styles.formError}>{uploadError}</p>
          ) : null}
          <div className={styles.uploadedFilesBlock}>
            <h3 className={styles.uploadedFilesHeading}>Uploaded Files</h3>
            {attachments.length === 0 ? (
              <p className={styles.sectionSubtext}>No attachments yet.</p>
            ) : (
              <ul className={styles.uploadedFilesList}>
                {attachments.map((a) => (
                  <li key={a.id} className={styles.uploadedFileRow}>
                    <div className={styles.uploadedFilePreview}>
                      <UploadedAttachmentPreview
                        attachment={a}
                        cachedPreviewUrl={attachmentPreviewById[a.id]}
                      />
                    </div>
                    <div className={styles.uploadedFileMeta}>
                      <strong>{a.filename}</strong>
                      <div className={styles.uploadedFileMetaRow}>
                        {a.label ? (
                          <span className={styles.uploadedFileLabel}>{a.label}</span>
                        ) : null}
                        <span className={attachmentStatusTagClass(a.status)}>
                          {attachmentStatusLabel(a.status)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => removeAttachment(a.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
