-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "stripeConnectAccountId" TEXT,
ADD COLUMN     "stripeConnectOnboardingStatus" TEXT,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN,
ADD COLUMN     "stripeRequirementsDue" JSONB,
ADD COLUMN     "ethosPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ethosPayoutsNote" TEXT,
ADD COLUMN     "stripeConnectSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_stripeConnectAccountId_key" ON "Shop"("stripeConnectAccountId");
