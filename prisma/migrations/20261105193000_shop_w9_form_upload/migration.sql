-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "w9FormStorageKey" TEXT,
ADD COLUMN     "w9FormFilename" TEXT,
ADD COLUMN     "w9FormContentType" TEXT,
ADD COLUMN     "w9FormUploadedAt" TIMESTAMP(3),
ADD COLUMN     "w9FormVerifiedAt" TIMESTAMP(3);
