import { MOCK_CATALOG_PRODUCTS } from "./mock-catalog";

export type CustomProductStatus = "active" | "draft" | "archived";

export type MockCustomProduct = {
  id: string;
  title: string;
  ethosSku: string;
  baseProductGid: string;
  baseProductTitle: string;
  status: CustomProductStatus;
  unitsPurchased: number;
  orderCount: number;
  totalSalesUsd: string;
  vendorShareUsd: string;
  firstListedAt: string;
  lastPurchasedAt: string | null;
  imageUrl: string;
};

const tee = MOCK_CATALOG_PRODUCTS[0];
const hoodie = MOCK_CATALOG_PRODUCTS[1];

/** Enough rows for two pages at 25 per page in the Custom Products preview grid. */
const PREVIEW_CUSTOM_PRODUCT_PAGE_SIZE = 25;
const PREVIEW_CUSTOM_PRODUCT_TARGET =
  PREVIEW_CUSTOM_PRODUCT_PAGE_SIZE * 2;

const PREVIEW_CAMPAIGN_NAMES = [
  "Orientation Week",
  "Parents Weekend",
  "Regional Championship",
  "Band Boosters",
  "STEM Night",
  "Greek Week",
  "Charity 5K",
  "Winter Formal",
  "Spring Carnival",
  "Debate Finals",
  "Robotics Showcase",
  "Art Walk",
  "Film Festival",
  "Lacrosse Classic",
  "Soccer Invitational",
  "Volleyball Jam",
  "Track & Field Day",
  "Swim Meet",
  "Theater Premiere",
  "Jazz Concert",
  "Poetry Slam",
  "Earth Day",
  "Veterans Tribute",
  "Homecoming Parade",
  "Leadership Summit",
  "Entrepreneur Expo",
  "Coding Hackathon",
  "Nursing Pinning",
  "Engineering Open House",
  "Law School Mixer",
  "Med School White Coat",
  "Library Fundraiser",
  "Museum Night",
  "Farmers Market",
  "Coffee House",
  "Esports League",
  "Chess Tournament",
  "Yearbook Sign-off",
  "Senior Send-off",
  "Commencement Eve",
  "Alumni Golf Outing",
  "Faculty Appreciation",
  "Student Gov Rally",
];

const CORE_MOCK_CUSTOM_PRODUCTS: MockCustomProduct[] = [
  {
    id: "ethos-custom-001",
    title: "Ethos Custom Classic Crew Tee — Campus 2026",
    ethosSku: "ETHOS-CC-26-CAMP",
    baseProductGid: tee.id,
    baseProductTitle: tee.title,
    status: "active",
    unitsPurchased: 142,
    orderCount: 89,
    totalSalesUsd: "3,408.00",
    vendorShareUsd: "1,207.00",
    firstListedAt: "2026-10-12T00:00:00.000Z",
    lastPurchasedAt: "2026-11-26T14:22:00.000Z",
    imageUrl: tee.imageUrl,
  },
  {
    id: "ethos-custom-002",
    title: "Ethos Custom Classic Crew Tee — Alumni Week",
    ethosSku: "ETHOS-CC-26-ALUM",
    baseProductGid: tee.id,
    baseProductTitle: tee.title,
    status: "active",
    unitsPurchased: 38,
    orderCount: 31,
    totalSalesUsd: "912.00",
    vendorShareUsd: "323.00",
    firstListedAt: "2026-10-28T00:00:00.000Z",
    lastPurchasedAt: "2026-11-24T09:10:00.000Z",
    imageUrl: tee.imageUrl,
  },
  {
    id: "ethos-custom-003",
    title: "Ethos Custom Performance Hoodie — Mountain Logo",
    ethosSku: "ETHOS-HD-MTN-01",
    baseProductGid: hoodie.id,
    baseProductTitle: hoodie.title,
    status: "active",
    unitsPurchased: 67,
    orderCount: 52,
    totalSalesUsd: "4,926.00",
    vendorShareUsd: "1,742.50",
    firstListedAt: "2026-09-05T00:00:00.000Z",
    lastPurchasedAt: "2026-11-27T16:45:00.000Z",
    imageUrl: hoodie.imageUrl,
  },
  {
    id: "ethos-custom-004",
    title: "Ethos Custom Performance Hoodie — Staff Store",
    ethosSku: "ETHOS-HD-STAFF",
    baseProductGid: hoodie.id,
    baseProductTitle: hoodie.title,
    status: "draft",
    unitsPurchased: 0,
    orderCount: 0,
    totalSalesUsd: "0.00",
    vendorShareUsd: "0.00",
    firstListedAt: "2026-11-20T00:00:00.000Z",
    lastPurchasedAt: null,
    imageUrl: hoodie.imageUrl,
  },
  {
    id: "ethos-custom-005",
    title: "Ethos Custom Classic Crew Tee — Founders Day (2025)",
    ethosSku: "ETHOS-CC-25-FDR",
    baseProductGid: tee.id,
    baseProductTitle: tee.title,
    status: "archived",
    unitsPurchased: 312,
    orderCount: 198,
    totalSalesUsd: "7,488.00",
    vendorShareUsd: "2,652.00",
    firstListedAt: "2025-08-01T00:00:00.000Z",
    lastPurchasedAt: "2026-06-30T18:00:00.000Z",
    imageUrl: tee.imageUrl,
  },
  {
    id: "ethos-custom-006",
    title: "Ethos Custom Classic Crew Tee — Homecoming Run",
    ethosSku: "ETHOS-CC-26-HC",
    baseProductGid: tee.id,
    baseProductTitle: tee.title,
    status: "active",
    unitsPurchased: 21,
    orderCount: 19,
    totalSalesUsd: "504.00",
    vendorShareUsd: "178.50",
    firstListedAt: "2026-11-01T00:00:00.000Z",
    lastPurchasedAt: "2026-11-22T11:05:00.000Z",
    imageUrl: tee.imageUrl,
  },
];

function formatUsdAmount(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function expandPreviewCustomProducts(
  items: MockCustomProduct[],
  targetCount: number,
): MockCustomProduct[] {
  if (items.length >= targetCount) return items;

  const expanded = [...items];
  const statusCycle: CustomProductStatus[] = ["active", "active", "active", "draft", "archived"];

  while (expanded.length < targetCount) {
    const slot = expanded.length - items.length;
    const base = slot % 2 === 0 ? tee : hoodie;
    const unitPrice = base === tee ? 24 : 78;
    const campaign = PREVIEW_CAMPAIGN_NAMES[slot % PREVIEW_CAMPAIGN_NAMES.length];
    const status = statusCycle[slot % statusCycle.length];
    const units = status === "draft" ? 0 : 8 + (slot * 19) % 340;
    const orders = status === "draft" ? 0 : Math.max(1, Math.floor(units * 0.62));
    const sales = units * unitPrice;
    const share = sales * 0.354;
    const month = (slot % 12) + 1;
    const day = (slot % 27) + 1;
    const seq = expanded.length + 1;

    expanded.push({
      id: `ethos-custom-${String(seq).padStart(3, "0")}`,
      title: `Ethos Custom ${base.title} — ${campaign}`,
      ethosSku: `ETHOS-${base === tee ? "CC" : "HD"}-PV-${String(seq).padStart(2, "0")}`,
      baseProductGid: base.id,
      baseProductTitle: base.title,
      status,
      unitsPurchased: units,
      orderCount: orders,
      totalSalesUsd: formatUsdAmount(sales),
      vendorShareUsd: formatUsdAmount(share),
      firstListedAt: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`,
      lastPurchasedAt:
        status === "draft" || units === 0
          ? null
          : `2026-11-${String((day % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
      imageUrl: base.imageUrl,
    });
  }

  return expanded;
}

export const MOCK_CUSTOM_PRODUCTS = expandPreviewCustomProducts(
  CORE_MOCK_CUSTOM_PRODUCTS,
  PREVIEW_CUSTOM_PRODUCT_TARGET,
);

export function customProductStatusLabel(status: CustomProductStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "draft":
      return "Draft";
    case "archived":
      return "Archived";
  }
}
