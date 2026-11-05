-- Vendor Registration & Marketplace Participation Agreement (electronic acceptance)
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementVersion" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementLegalName" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementDba" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementEntityType" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementBusinessAddress" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementWebsite" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementPrimaryContact" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementContactInfo" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementSignatoryName" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementSignatoryTitle" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementSignatureText" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementSignedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementAudit" JSONB;
