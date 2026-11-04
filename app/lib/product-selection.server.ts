import prisma from "../db.server";
export type SubmissionDisplayStatus =
  | "not_submitted"
  | "submitted"
  | "imported"
  | "needs_attention";

export async function getSelectedProductGids(shopDomain: string): Promise<Set<string>> {
  const rows = await prisma.productSelection.findMany({
    where: { shopDomain },
    select: { shopifyProductGid: true },
  });
  return new Set(rows.map((r) => r.shopifyProductGid));
}

export async function setProductSelected(
  shopDomain: string,
  shopifyProductGid: string,
  selected: boolean,
  variantGids: string[],
): Promise<void> {
  if (!selected) {
    await prisma.productSelection.deleteMany({
      where: { shopDomain, shopifyProductGid },
    });
    return;
  }

  const selection = await prisma.productSelection.upsert({
    where: {
      shopDomain_shopifyProductGid: { shopDomain, shopifyProductGid },
    },
    create: { shopDomain, shopifyProductGid },
    update: {},
  });

  if (variantGids.length === 0) return;

  await prisma.variantSelection.deleteMany({
    where: { productSelectionId: selection.id },
  });

  await prisma.variantSelection.createMany({
    data: variantGids.map((shopifyVariantGid) => ({
      productSelectionId: selection.id,
      shopifyVariantGid,
      selected: true,
    })),
    skipDuplicates: true,
  });
}

export async function getSubmissionStatusByProductGid(
  shopDomain: string,
  productGids: string[],
): Promise<Map<string, SubmissionDisplayStatus>> {
  const result = new Map<string, SubmissionDisplayStatus>();
  for (const gid of productGids) {
    result.set(gid, "not_submitted");
  }

  if (productGids.length === 0) return result;

  const maps = await prisma.shopifyProductMap.findMany({
    where: { shopDomain, shopifyProductGid: { in: productGids } },
    select: { shopifyProductGid: true },
  });
  for (const row of maps) {
    result.set(row.shopifyProductGid, "imported");
  }

  const lines = await prisma.submissionLine.findMany({
    where: {
      shopifyProductGid: { in: productGids },
      submission: { shopDomain },
    },
    select: { shopifyProductGid: true, status: true },
    orderBy: { updatedAt: "desc" },
  });

  for (const line of lines) {
    const current = result.get(line.shopifyProductGid) ?? "not_submitted";
    if (current === "imported") continue;

    if (line.status === "imported") {
      result.set(line.shopifyProductGid, "imported");
      continue;
    }
    if (line.status === "needs_attention" || line.status === "failed") {
      result.set(line.shopifyProductGid, "needs_attention");
      continue;
    }
    if (current === "not_submitted" && (line.status === "pending" || line.status === "processing")) {
      result.set(line.shopifyProductGid, "submitted");
    }
  }

  return result;
}

export async function countSelectedProducts(shopDomain: string): Promise<number> {
  return prisma.productSelection.count({ where: { shopDomain } });
}
