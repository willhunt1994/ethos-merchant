-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ShopSupplierApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('draft', 'submitted', 'processing', 'imported', 'needs_attention', 'failed');

-- CreateEnum
CREATE TYPE "SubmissionLineStatus" AS ENUM ('pending', 'processing', 'imported', 'needs_attention', 'failed');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSupplierLink" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "ethosSupplierId" INTEGER NOT NULL,
    "ethosSupplierSlug" TEXT NOT NULL,
    "approvalStatus" "ShopSupplierApprovalStatus" NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "approvedByUserRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSupplierLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantUiPreference" (
    "shopDomain" TEXT NOT NULL,
    "productViewMode" TEXT NOT NULL DEFAULT 'grid',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantUiPreference_pkey" PRIMARY KEY ("shopDomain")
);

-- CreateTable
CREATE TABLE "ProductSelection" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyProductGid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantSelection" (
    "id" TEXT NOT NULL,
    "productSelectionId" TEXT NOT NULL,
    "shopifyVariantGid" TEXT NOT NULL,
    "ethosPrice" DECIMAL(10,2),
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'draft',
    "merchantInstructions" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionLine" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "shopifyProductGid" TEXT NOT NULL,
    "shopifyVariantGids" JSONB NOT NULL,
    "ethosPrice" DECIMAL(10,2),
    "status" "SubmissionLineStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyProductMap" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyProductGid" TEXT NOT NULL,
    "ethosSupplierSlug" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyProductMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyVariantMap" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyVariantGid" TEXT NOT NULL,
    "shopifyProductGid" TEXT NOT NULL,
    "shopifyProductMapId" TEXT,
    "ethosSupplierSlug" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "shopifyBarcode" TEXT,
    "countryOfOrigin" CHAR(2),
    "lastInventorySyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyVariantMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "shopDomain" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("shopDomain","resource")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "Shop"("shopDomain");

-- CreateIndex
CREATE INDEX "ShopSupplierLink_ethosSupplierSlug_idx" ON "ShopSupplierLink"("ethosSupplierSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSupplierLink_shopId_ethosSupplierSlug_key" ON "ShopSupplierLink"("shopId", "ethosSupplierSlug");

-- CreateIndex
CREATE INDEX "ProductSelection_shopDomain_idx" ON "ProductSelection"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSelection_shopDomain_shopifyProductGid_key" ON "ProductSelection"("shopDomain", "shopifyProductGid");

-- CreateIndex
CREATE UNIQUE INDEX "VariantSelection_productSelectionId_shopifyVariantGid_key" ON "VariantSelection"("productSelectionId", "shopifyVariantGid");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_idempotencyKey_key" ON "Submission"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Submission_shopDomain_status_idx" ON "Submission"("shopDomain", "status");

-- CreateIndex
CREATE INDEX "SubmissionLine_submissionId_idx" ON "SubmissionLine"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProductMap_shopDomain_shopifyProductGid_key" ON "ShopifyProductMap"("shopDomain", "shopifyProductGid");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyProductMap_shopDomain_ethosSupplierSlug_itemCode_key" ON "ShopifyProductMap"("shopDomain", "ethosSupplierSlug", "itemCode");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyVariantMap_shopifyVariantGid_key" ON "ShopifyVariantMap"("shopifyVariantGid");

-- CreateIndex
CREATE INDEX "ShopifyVariantMap_shopDomain_shopifyProductGid_idx" ON "ShopifyVariantMap"("shopDomain", "shopifyProductGid");

-- CreateIndex
CREATE INDEX "ShopifyVariantMap_ethosSupplierSlug_itemCode_idx" ON "ShopifyVariantMap"("ethosSupplierSlug", "itemCode");

-- CreateIndex
CREATE INDEX "WebhookEvent_shopDomain_processedAt_idx" ON "WebhookEvent"("shopDomain", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_shopDomain_topic_payloadHash_key" ON "WebhookEvent"("shopDomain", "topic", "payloadHash");

-- AddForeignKey
ALTER TABLE "ShopSupplierLink" ADD CONSTRAINT "ShopSupplierLink_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantSelection" ADD CONSTRAINT "VariantSelection_productSelectionId_fkey" FOREIGN KEY ("productSelectionId") REFERENCES "ProductSelection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionLine" ADD CONSTRAINT "SubmissionLine_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyVariantMap" ADD CONSTRAINT "ShopifyVariantMap_shopifyProductMapId_fkey" FOREIGN KEY ("shopifyProductMapId") REFERENCES "ShopifyProductMap"("id") ON DELETE SET NULL ON UPDATE CASCADE;
