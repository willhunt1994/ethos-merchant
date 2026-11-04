#!/usr/bin/env node
/**
 * Link a Shopify shop to an Ethos custom supplier (Postgres ShopSupplierLink).
 *
 * Usage:
 *   node scripts/link-supplier.mjs --shop ethos-merchant.myshopify.com --slug acme --id 12 --approve
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
} catch {
  // DATABASE_URL must be set in the environment
}

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const shop = arg("--shop");
const slug = arg("--slug")?.toLowerCase();
const idRaw = arg("--id");
const approve = process.argv.includes("--approve");
const reject = process.argv.includes("--reject");

if (!shop || !slug || !idRaw) {
  console.error(
    "Usage: node scripts/link-supplier.mjs --shop <domain.myshopify.com> --slug <supplier-slug> --id <ethosSupplierId> [--approve|--reject]",
  );
  process.exit(1);
}

const ethosSupplierId = Number(idRaw);
if (!Number.isInteger(ethosSupplierId) || ethosSupplierId <= 0) {
  console.error(
    `--id must be a positive integer (MySQL catalog_custom_suppliers.id), not "${idRaw}".`,
  );
  console.error(
    "Example: pnpm link-supplier -- --shop ethos-merchant.myshopify.com --slug acme-merch --id 42 --approve",
  );
  process.exit(1);
}

if (slug.includes("your_") || slug.includes("your-") || slug.toUpperCase().includes("SLUG")) {
  console.warn(`Warning: --slug "${slug}" looks like a placeholder. Use the real custom supplier slug from Ethos Employee.`);
}

const approvalStatus = approve ? "approved" : reject ? "rejected" : "pending";
const prisma = new PrismaClient();

try {
  const shopRow = await prisma.shop.upsert({
    where: { shopDomain: shop },
    create: { shopDomain: shop },
    update: {},
  });

  const link = await prisma.shopSupplierLink.upsert({
    where: { shopId_ethosSupplierSlug: { shopId: shopRow.id, ethosSupplierSlug: slug } },
    create: {
      shopId: shopRow.id,
      ethosSupplierId,
      ethosSupplierSlug: slug,
      approvalStatus,
      approvedAt: approvalStatus === "approved" ? new Date() : null,
      approvedByUserRef: "cli:link-supplier",
    },
    update: {
      ethosSupplierId,
      approvalStatus,
      approvedAt: approvalStatus === "approved" ? new Date() : null,
      approvedByUserRef: "cli:link-supplier",
    },
  });

  console.log("OK", {
    shopDomain: shop,
    ethosSupplierSlug: link.ethosSupplierSlug,
    ethosSupplierId: link.ethosSupplierId,
    approvalStatus: link.approvalStatus,
  });
} finally {
  await prisma.$disconnect();
}
