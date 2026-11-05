-- AlterTable
ALTER TABLE "ProductSelection" ADD COLUMN "offerQuantityDiscounts" BOOLEAN NOT NULL DEFAULT false;

-- Shops that already saved quantity tier JSON keep quantity discounts enabled.
UPDATE "ProductSelection" ps
SET "offerQuantityDiscounts" = true
WHERE EXISTS (
  SELECT 1 FROM "VariantSelection" vs
  WHERE vs."productSelectionId" = ps.id
    AND vs."ethosQuantityPricing" IS NOT NULL
);
