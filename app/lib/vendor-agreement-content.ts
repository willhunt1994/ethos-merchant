/** Must match accepted records in Shop.vendorAgreementVersion */
export const CURRENT_VENDOR_AGREEMENT_VERSION = "draft-2026-11-v1.1";

export const VENDOR_AGREEMENT_TITLE =
  "Vendor Registration & Marketplace Participation Agreement";

export const VENDOR_AGREEMENT_DRAFT_NOTICE =
  "Draft v1.1 | November 2026 | Legal review required before execution";

export type VendorAgreementSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export const DEFAULT_ETHOS_LEGAL_ENTITY_NAME = "Ethos Community LLC";

export function ethosLegalEntityName(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.ETHOS_LEGAL_ENTITY_NAME?.trim()
      : undefined;
  return fromEnv || DEFAULT_ETHOS_LEGAL_ENTITY_NAME;
}

export function vendorAgreementIntroParagraphs(): string[] {
  const ethos = ethosLegalEntityName();
  return [
    `This Vendor Registration & Marketplace Participation Agreement (the "Agreement") is entered into as of the Effective Date below between ${ethos}, doing business as Ethos ("Ethos"), and the vendor identified below ("Vendor"). The parties agree as follows. The Ethos dashboard and related sales channels are the "Platform."`,
  ];
}

/** Full agreement body for in-app display (matches draft PDF structure). */
export const VENDOR_AGREEMENT_SECTIONS: VendorAgreementSection[] = [
  {
    id: "registration",
    title: "1. Registration and Verification",
    paragraphs: [
      "Vendor shall provide accurate and current registration information, notify Ethos promptly of material changes, and supply reasonably requested business licenses, registrations, insurance evidence, product certifications and identity verification. Vendor shall provide a completed IRS Form W-9 if a U.S. person, or the appropriate IRS Form W-8 if applicable, and secure payment details through an approved channel. Ethos may decline or suspend onboarding pending verification, subject to law.",
    ],
  },
  {
    id: "listings",
    title: "2. Product Authorization and Listings",
    paragraphs: [
      "Vendor represents that it owns or is duly authorized to distribute and sell each submitted product and to license all submitted product content. Vendor grants Ethos a nonexclusive, worldwide, royalty-free license during the Agreement to reproduce, format, display and use submitted product images, names, descriptions and marks to operate, advertise, sell and fulfill Platform offerings. Vendor retains its preexisting intellectual property. Ethos may reject, edit for formatting, remove or suspend listings for compliance, accuracy, safety or commercial reasons.",
    ],
  },
  {
    id: "inventory",
    title: "3. Product Information and Inventory",
    paragraphs: [
      "Vendor shall keep product descriptions, SKUs, variants, dimensions, materials, country of origin, images, prices, stock levels, lead times, care instructions and applicable warnings accurate and current. Vendor shall promptly report discontinued items, shortages, safety concerns, defects and changes affecting accepted orders. Ethos may rely on Vendor-submitted data but is not required to publish any particular listing.",
    ],
  },
  {
    id: "commercial-model",
    title: "4. Commercial Model and Order Acceptance",
    paragraphs: [
      "Each product or transaction must be assigned a written commercial model in Schedule A or an accepted order: wholesale purchase, consignment, marketplace/revenue share or another expressly identified arrangement. The schedule must identify seller of record, ownership of inventory, title/risk transfer, tax collection, shipping, refunds, payment triggers and applicable fees. A product listing does not guarantee orders. Accepted purchase orders may not be unilaterally repriced or substituted.",
    ],
  },
  {
    id: "pricing",
    title: "5. Pricing and Commercial Terms",
    paragraphs: [
      "Vendor product costs, agreed fees, commissions, payout calculations, discount allocation and settlement timing shall be set forth in Schedule A or an accepted purchase order. Unless a lawful, separately executed pricing provision applies, Ethos independently determines its resale prices for products it purchases. Changes to Vendor costs or commercial terms require advance written agreement and do not retroactively affect accepted orders.",
    ],
  },
  {
    id: "minimum-retail",
    title: "5.1. Non-Customized Product Minimum Retail Price",
    paragraphs: [
      "For a product sold in its original, unmodified condition without printing, embroidery, patches, labeling or other customization, the parties intend that Ethos will not advertise, offer or sell the product below the product-specific minimum retail price submitted by Vendor and expressly accepted by Ethos in Schedule A or the Platform (\"Minimum Retail Price\"). The intended restriction does not apply to customized products, for which Ethos may independently set its final retail price. Any proposed minimum price change or promotional exception must be accepted in writing in advance and will not apply retroactively to accepted orders.",
      "This clause shall not become operative unless and until the parties obtain appropriate legal review and confirm that the proposed arrangement is lawful in each applicable jurisdiction; if not, it must be replaced with a legally compliant alternative.",
    ],
  },
  {
    id: "fulfillment",
    title: "6. Orders, Shipping and Fulfillment",
    paragraphs: [
      "Vendor shall perform accepted orders according to approved specifications, quantities, lead times and shipping instructions, promptly flag delays and obtain written approval for substitutions. Schedule A or the purchase order shall allocate freight charges, insurance, shipping claims, title and risk of loss. Vendor shall provide reasonable tracking and fulfillment records where applicable.",
    ],
  },
  {
    id: "quality",
    title: "7. Quality, Compliance and Recalls",
    paragraphs: [
      "Vendor warrants that products conform to approved specifications, are free of material defects, are properly labeled and comply with applicable product safety, import, consumer protection and intellectual property laws. Vendor shall promptly notify Ethos of any safety incident, regulatory action or recall, cooperate in corrective action and bear costs to the extent attributable to Vendor, subject to applicable law and the commercial terms.",
    ],
  },
  {
    id: "customization-ip",
    title: "8. Customization and Intellectual Property",
    paragraphs: [
      "Ethos may provide printing, embroidery, patches, packaging and other customization to the extent authorized for the applicable products. Vendor retains ownership of its preexisting marks and designs; Ethos retains ownership of its independently developed artwork, software, processes and materials, subject to separately agreed customer rights. Neither party may use the other party's marks outside the permissions expressly granted.",
    ],
  },
  {
    id: "payments",
    title: "9. Payments, Refunds and Adjustments",
    paragraphs: [
      "Payouts, if applicable, will follow the agreed settlement schedule and may reflect completed eligible sales, fees, refunds, chargebacks, discounts and expressly approved adjustments. Ethos will provide reasonable supporting transaction records. Disputed amounts may be held only as permitted by applicable law and the commercial schedule; undisputed amounts remain payable when due. Neither party shall impose undisclosed deductions.",
    ],
  },
  {
    id: "returns",
    title: "10. Returns and Customer Disputes",
    paragraphs: [
      "Schedule A shall assign responsibility for returns, cancellations, defects, replacements and customer service. Vendor is responsible for nonconforming or defective goods attributable to Vendor; Ethos is responsible for customization errors solely attributable to Ethos, except as otherwise lawfully agreed. Both parties shall cooperate on customer remedies and required notices.",
    ],
  },
  {
    id: "confidentiality",
    title: "11. Confidentiality and Data Protection",
    paragraphs: [
      "Each party shall protect the other's nonpublic commercial, customer, technical and pricing information using reasonable safeguards and use it only to perform this Agreement. Disclosure is permitted to authorized personnel and service providers bound by appropriate confidentiality duties, or as required by law. Vendor shall not independently solicit Ethos customers using customer information obtained solely through the Platform without lawful authorization. Each party shall comply with applicable privacy laws and promptly notify the other of a relevant security incident.",
    ],
  },
  {
    id: "platform-rules",
    title: "12. Account Security and Platform Rules",
    paragraphs: [
      "Vendor shall restrict access to authorized users, safeguard credentials and promptly report unauthorized access. Vendor shall not scrape restricted data, interfere with Platform systems, upload malicious code or use the Platform unlawfully. Ethos may suspend access reasonably necessary to protect customers, data, operations or legal compliance.",
    ],
  },
  {
    id: "independent",
    title: "13. Independent Parties",
    paragraphs: [
      "The parties are independent contractors. Nothing creates employment, partnership, franchise, joint venture or general agency. Neither may bind the other without written authorization.",
    ],
  },
  {
    id: "indemnity",
    title: "14. Indemnification",
    paragraphs: [
      "To the extent permitted by law, Vendor shall defend and indemnify Ethos and its personnel against third-party claims, damages and reasonable expenses arising from Vendor's defective or unlawful products, intellectual property infringement, negligence, willful misconduct or material breach, except to the extent caused by Ethos's own acts or omissions. Claims procedures and control of defense shall be handled reasonably and in good faith.",
    ],
  },
  {
    id: "liability",
    title: "15. Limitation of Liability",
    paragraphs: [
      "Except for fraud, willful misconduct, payment obligations, confidentiality breaches, intellectual property infringement, indemnity obligations or liabilities that cannot lawfully be limited, neither party is liable for indirect, special, incidental or consequential damages. Any aggregate liability cap must be expressly established in Schedule A or a signed amendment; none is implied by this provision.",
    ],
  },
  {
    id: "term",
    title: "16. Term, Suspension and Termination",
    paragraphs: [
      "This Agreement begins upon acceptance by both parties and continues until terminated. Either party may terminate on 30 days' written notice, or immediately for fraud, illegality, serious safety/security concerns or incurable material breach. For a curable material breach, the nonbreaching party shall give written notice and a reasonable 15-day opportunity to cure unless urgent circumstances require suspension. Accrued obligations, accepted orders and provisions intended to survive remain effective.",
    ],
  },
  {
    id: "law",
    title: "17. Governing Law and Disputes",
    paragraphs: [
      "California law governs, without regard to conflict-of-laws rules. The parties shall first attempt good-faith resolution through written notice and discussion for 30 days, except where urgent relief is needed. Subject to applicable law, exclusive venue shall be state or federal courts in San Diego County, California.",
    ],
  },
  {
    id: "general",
    title: "18. General Provisions",
    paragraphs: [
      "This Agreement and expressly incorporated schedules and accepted orders constitute the agreement on their subject matter. Amendments require written acceptance by authorized representatives, including legally valid electronic acceptance. Invalid provisions shall be severed without affecting the remainder. Assignment requires consent except for a bona fide sale or reorganization where the successor assumes obligations. Notices shall be sent to the business contacts designated by each party. In a conflict, a signed product-specific schedule controls solely for its expressly addressed commercial terms.",
    ],
  },
  {
    id: "certifications",
    title: "19. Vendor Certifications",
    paragraphs: [
      "By signing, Vendor confirms that its submitted information is accurate to its knowledge, it has rights to list and supply its products, its representative is authorized to sign, and it has reviewed this Agreement and the applicable Schedule A.",
    ],
  },
  {
    id: "esign",
    title: "20. Electronic Signatures",
    paragraphs: [
      "The parties consent to electronic records and signatures, subject to applicable electronic transactions law. The Platform retains the final accepted document version, signer identity, signature date/time, consent record and an appropriate audit trail.",
    ],
  },
  {
    id: "schedule-a",
    title: "Schedule A — Commercial Terms",
    paragraphs: [
      "Commercial model, seller of record, SKU lists, pricing, payouts, shipping, returns, tax, insurance and other transaction-specific terms are completed with Ethos before live transactions. Schedule A will be incorporated when agreed in writing or through an accepted order.",
    ],
  },
];

export const VENDOR_AGREEMENT_PDF_PATH = "/legal/ethos-vendor-marketplace-agreement.pdf";
