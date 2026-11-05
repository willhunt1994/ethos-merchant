-- Schedule A commercial terms + Ethos counter-signature
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementScheduleA" JSONB;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementEthosSignedAt" TIMESTAMP(3);
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementEthosSignatoryName" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementEthosSignatoryTitle" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementEthosSignedByRef" TEXT;
ALTER TABLE "Shop" ADD COLUMN "vendorAgreementEthosSignAudit" JSONB;
