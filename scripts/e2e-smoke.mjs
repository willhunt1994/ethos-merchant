#!/usr/bin/env node
/**
 * Phase 9 — automated smoke checks (local or CI).
 * Does not drive Shopify Admin UI; validates DB, env, and Employee API reachability.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const DEV_STORE = "ethos-merchant.myshopify.com";

function loadEnvFile() {
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
    /* DATABASE_URL must be set */
  }
}

loadEnvFile();

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  failures.push(msg);
  console.error(`✗ ${msg}`);
}

async function checkDatabase() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL is not set");
    return null;
  }
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    pass("Postgres reachable (DATABASE_URL)");
    return prisma;
  } catch (e) {
    fail(`Postgres unreachable: ${e instanceof Error ? e.message : e}`);
    await prisma.$disconnect().catch(() => {});
    return null;
  }
}

async function checkMerchantData(prisma) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain: DEV_STORE } });
  if (!shop) {
    fail(`No Shop row for ${DEV_STORE} — open the embedded app once or run link-supplier`);
  } else {
    pass(`Shop record exists: ${DEV_STORE}`);
  }

  const links = await prisma.shopSupplierLink.findMany({
    where: { shop: { shopDomain: DEV_STORE } },
  });
  const approved = links.filter((l) => l.approvalStatus === "approved");
  if (approved.length === 0) {
    fail(
      `No approved ShopSupplierLink for ${DEV_STORE} — pnpm link-supplier -- --shop ${DEV_STORE} --slug <slug> --id <id> --approve`,
    );
  } else {
    pass(`Approved supplier link(s): ${approved.map((l) => l.ethosSupplierSlug).join(", ")}`);
  }

  const mapCount = await prisma.shopifyProductMap.count({ where: { shopDomain: DEV_STORE } });
  if (mapCount === 0) {
    fail("No ShopifyProductMap rows — complete Phase 6 submit at least once");
  } else {
    pass(`ShopifyProductMap count: ${mapCount}`);
  }

  const submissionCount = await prisma.submission.count({ where: { shopDomain: DEV_STORE } });
  pass(`Submission count: ${submissionCount}`);

  const webhookCount = await prisma.webhookEvent.count({ where: { shopDomain: DEV_STORE } });
  if (webhookCount === 0) {
    console.log(`  (no WebhookEvent rows yet — trigger inventory/title change after Phase 8)`);
  } else {
    pass(`WebhookEvent count: ${webhookCount}`);
  }
}

async function checkEmployeeApi() {
  const base = process.env.ETHOS_INTEGRATION_API_URL?.trim().replace(/\/+$/, "");
  const key = process.env.ETHOS_INTEGRATION_API_KEY?.trim();
  if (!base) {
    fail("ETHOS_INTEGRATION_API_URL is not set");
    return;
  }
  if (!key) {
    fail("ETHOS_INTEGRATION_API_KEY is not set");
    return;
  }
  pass("Ethos integration env vars present");

  let healthRes;
  try {
    healthRes = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
  } catch (e) {
    fail(`Employee API /health unreachable at ${base}: ${e instanceof Error ? e.message : e}`);
    return;
  }
  if (!healthRes.ok) {
    fail(`Employee API /health returned ${healthRes.status}`);
    return;
  }
  pass(`Employee API /health OK (${base})`);

  const probeRes = await fetch(`${base}/integrations/shopify/v1/sync-product`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(8000),
  });
  if (probeRes.status === 401 || probeRes.status === 403) {
    fail("Integration auth rejected — ETHOS_INTEGRATION_API_KEY mismatch with Employee API");
    return;
  }
  if (probeRes.status === 400 || probeRes.status === 404) {
    pass("Integration route sync-product reachable (auth OK)");
  } else {
    fail(`Unexpected sync-product probe status: ${probeRes.status}`);
  }
}

async function checkShopPayoutApi() {
  const appUrl = process.env.SHOPIFY_APP_URL?.trim().replace(/\/+$/, "");
  const key = process.env.ETHOS_INTEGRATION_API_KEY?.trim();
  if (!appUrl || !key) {
    pass("Shop payout API check skipped (SHOPIFY_APP_URL or ETHOS_INTEGRATION_API_KEY unset)");
    return;
  }

  let res;
  try {
    res = await fetch(`${appUrl}/integrations/shopify/v1/shop-payout?limit=5`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    fail(`Shop payout API unreachable at ${appUrl}: ${e instanceof Error ? e.message : e}`);
    return;
  }
  if (res.status === 401 || res.status === 403) {
    fail("Shop payout API auth rejected");
    return;
  }
  if (!res.ok) {
    fail(`Shop payout API returned ${res.status}`);
    return;
  }
  const body = await res.json().catch(() => null);
  if (!body?.ok || !Array.isArray(body.payouts)) {
    fail("Shop payout API response shape unexpected");
    return;
  }
  pass(`Shop payout API OK (${body.payouts.length} shop(s) in sample)`);
}

async function main() {
  console.log(`\nEthos merchant E2E smoke — dev store: ${DEV_STORE}\n`);

  const prisma = await checkDatabase();
  await checkEmployeeApi();
  await checkShopPayoutApi();
  if (prisma) {
    try {
      await checkMerchantData(prisma);
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log("");
  if (failures.length === 0) {
    console.log(`All ${passes.length} checks passed. Run manual UI steps in docs/phase-9-e2e-dev-store.md if needed.`);
    process.exit(0);
  }
  console.error(`${failures.length} check(s) failed, ${passes.length} passed.`);
  process.exit(1);
}

main();
