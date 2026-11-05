import { existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { SCHEDULE_A_SECTIONS } from "./vendor-agreement-schedule-a";
import {
  VENDOR_AGREEMENT_SECTIONS,
  VENDOR_AGREEMENT_TITLE,
  ethosLegalEntityName,
  vendorAgreementIntroParagraphs,
} from "./vendor-agreement-content";
import type { VendorAgreementView } from "./vendor-agreement.server";
import { isDrawnVendorSignature } from "./vendor-signature";

const CONTENT_BOTTOM = 696;
const FOOTER_Y = 756;

function ethosLogoPath(): string {
  return join(process.cwd(), "public/assets/ethos-logo-black.png");
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function copyrightNotice(): string {
  return `© Ethos ${new Date().getFullYear()}`;
}

function ensurePageSpace(doc: PdfDoc, minHeight: number) {
  if (doc.y + minHeight > CONTENT_BOTTOM) {
    doc.addPage();
  }
}

function renderPdfHeader(doc: PdfDoc, title: string) {
  const logo = ethosLogoPath();
  const top = doc.page.margins.top;
  const textLeft = doc.page.margins.left + 102;
  const textWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right - 102;

  if (existsSync(logo)) {
    doc.image(logo, doc.page.margins.left, top, { width: 88 });
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#111111")
    .text(title, textLeft, top, {
      width: textWidth,
      lineGap: 2,
    });
  doc.y = Math.max(doc.y, top + 44);
  doc.moveDown(0.85);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#dddddd")
    .stroke();
  doc.moveDown(0.75);
}

function renderIntroParagraphs(doc: PdfDoc, paragraphs: string[]) {
  doc.font("Helvetica").fontSize(9.5).fillColor("#222222");
  for (const paragraph of paragraphs) {
    ensurePageSpace(doc, 36);
    doc.text(paragraph, { align: "left", lineGap: 2 });
    doc.moveDown(0.5);
  }
}

function renderBodySections(
  doc: PdfDoc,
  sections: Array<{ title: string; paragraphs: string[] }>,
) {
  for (const section of sections) {
    ensurePageSpace(doc, 48);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(section.title);
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(9.5).fillColor("#222222");
    for (const paragraph of section.paragraphs) {
      ensurePageSpace(doc, 40);
      doc.text(paragraph, { align: "left", lineGap: 2 });
      doc.moveDown(0.45);
    }
    doc.moveDown(0.25);
  }
}

function renderFootersOnAllPages(doc: PdfDoc) {
  const notice = copyrightNotice();
  const range = doc.bufferedPageRange();
  const textWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#888888")
      .text(notice, doc.page.margins.left, FOOTER_Y, {
        width: textWidth,
        align: "center",
        lineBreak: false,
      });
  }
}

function buildPdf(render: (doc: PdfDoc) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      render(doc);
      renderFootersOnAllPages(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function buildStyledTermsPdf(opts: {
  title: string;
  introParagraphs: string[];
  sections: Array<{ title: string; paragraphs: string[] }>;
}): Promise<Buffer> {
  return buildPdf((doc) => {
    renderPdfHeader(doc, opts.title);
    renderIntroParagraphs(doc, opts.introParagraphs);
    renderBodySections(doc, opts.sections);
  });
}

export async function buildVendorAgreementTermsPdf(): Promise<Buffer> {
  return buildStyledTermsPdf({
    title: VENDOR_AGREEMENT_TITLE,
    introParagraphs: vendorAgreementIntroParagraphs(),
    sections: VENDOR_AGREEMENT_SECTIONS.map((s) => ({
      title: s.title,
      paragraphs: s.paragraphs,
    })),
  });
}

export async function buildScheduleATermsPdf(): Promise<Buffer> {
  return buildStyledTermsPdf({
    title: "Schedule A — Commercial Terms",
    introParagraphs: [
      "Standard commercial terms incorporated into the Ethos Vendor Registration & Marketplace Participation Agreement.",
    ],
    sections: SCHEDULE_A_SECTIONS.map((s) => ({
      title: s.title,
      paragraphs: s.paragraphs,
    })),
  });
}

function renderKeyValueBlock(
  doc: PdfDoc,
  heading: string,
  rows: Array<{ label: string; value: string }>,
) {
  ensurePageSpace(doc, 56);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(heading);
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9).fillColor("#222222");
  for (const row of rows) {
    if (!row.value.trim()) continue;
    ensurePageSpace(doc, 20);
    doc.font("Helvetica-Bold").text(`${row.label}: `, { continued: true });
    doc.font("Helvetica").text(row.value.trim(), { lineGap: 1 });
    doc.moveDown(0.25);
  }
  doc.moveDown(0.35);
}

function renderVendorSignatureBlock(doc: PdfDoc, agreement: VendorAgreementView) {
  ensurePageSpace(doc, 120);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Vendor Acceptance");
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9).fillColor("#222222");
  const signedLabel = agreement.signedAt
    ? new Date(agreement.signedAt).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC"
    : "—";
  doc.text(`Signed: ${signedLabel}`);
  doc.text(`Authorized signatory: ${agreement.signatoryName || "—"}`);
  doc.text(`Title: ${agreement.signatoryTitle || "—"}`);
  doc.moveDown(0.35);
  if (isDrawnVendorSignature(agreement.signatureText)) {
    try {
      const b64 = agreement.signatureText.slice("data:image/png;base64,".length);
      const img = Buffer.from(b64, "base64");
      doc.image(img, doc.page.margins.left, doc.y, { fit: [220, 56] });
      doc.y += 60;
    } catch {
      doc.text("[Signature on file]");
    }
  } else if (agreement.signatureText.trim()) {
    doc.font("Helvetica-Oblique").text(agreement.signatureText.trim());
  }
  doc.moveDown(0.5);
}

function renderEthosSignatureBlock(doc: PdfDoc, agreement: VendorAgreementView) {
  ensurePageSpace(doc, 72);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("Ethos Acceptance");
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9).fillColor("#222222");
  const ethos = ethosLegalEntityName();
  if (agreement.fullyExecuted && agreement.ethosSignedAt) {
    doc.text(`Signed: ${new Date(agreement.ethosSignedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC`);
    doc.text(`${ethos}`);
    doc.text(`${agreement.ethosSignatoryName || "—"}, ${agreement.ethosSignatoryTitle || "—"}`);
  } else {
    doc.fillColor("#666666").text(`Awaiting countersignature by ${ethos}.`);
    doc.fillColor("#222222");
  }
}

export async function buildVendorAgreementSignedPdf(
  agreement: VendorAgreementView,
): Promise<Buffer> {
  return buildPdf((doc) => {
    renderPdfHeader(doc, `${VENDOR_AGREEMENT_TITLE} — Signed Copy`);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#444444")
      .text(`Agreement version: ${agreement.version ?? "—"}`, { lineGap: 1 });
    doc.moveDown(0.5);

    renderKeyValueBlock(doc, "Vendor Registration", [
      { label: "Legal business name", value: agreement.legalName },
      { label: "DBA", value: agreement.dba },
      { label: "Entity type", value: agreement.entityType },
      { label: "State/country of formation", value: agreement.entityFormation },
      { label: "Business address", value: agreement.businessAddress.replace(/\n/g, ", ") },
      { label: "Website", value: agreement.website },
      { label: "Primary contact", value: agreement.primaryContact },
      { label: "Email", value: agreement.contactEmail },
      { label: "Phone", value: agreement.contactPhone },
    ]);

    renderIntroParagraphs(doc, vendorAgreementIntroParagraphs());
    renderBodySections(
      doc,
      VENDOR_AGREEMENT_SECTIONS.map((s) => ({ title: s.title, paragraphs: s.paragraphs })),
    );

    doc.addPage();
    renderPdfHeader(doc, "Schedule A — Commercial Terms");
    renderBodySections(
      doc,
      SCHEDULE_A_SECTIONS.map((s) => ({ title: s.title, paragraphs: s.paragraphs })),
    );

    renderVendorSignatureBlock(doc, agreement);
    renderEthosSignatureBlock(doc, agreement);
  });
}
