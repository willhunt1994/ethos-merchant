-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('pending', 'uploaded', 'failed');

-- CreateTable
CREATE TABLE "ProductAttachment" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "shopifyProductGid" TEXT NOT NULL,
    "productSelectionId" TEXT,
    "category" TEXT NOT NULL,
    "label" TEXT,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" BIGINT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttachment_storageKey_key" ON "ProductAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "ProductAttachment_shopDomain_shopifyProductGid_idx" ON "ProductAttachment"("shopDomain", "shopifyProductGid");

-- AddForeignKey
ALTER TABLE "ProductAttachment" ADD CONSTRAINT "ProductAttachment_productSelectionId_fkey" FOREIGN KEY ("productSelectionId") REFERENCES "ProductSelection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
