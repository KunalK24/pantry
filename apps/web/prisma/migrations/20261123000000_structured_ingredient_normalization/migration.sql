ALTER TABLE "Ingredient"
  ADD COLUMN "normalizedName" TEXT;

UPDATE "Ingredient"
SET "normalizedName" = lower(trim("name"));

ALTER TABLE "Ingredient"
  ALTER COLUMN "normalizedName" SET NOT NULL;

ALTER TABLE "RecipeIngredient"
  ADD COLUMN "brand" TEXT,
  ADD COLUMN "modifiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "packageQuantity" TEXT,
  ADD COLUMN "packageUnit" TEXT;

ALTER TABLE "PantryItem"
  ADD COLUMN "brand" TEXT,
  ADD COLUMN "modifiers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "packageQuantity" TEXT,
  ADD COLUMN "packageUnit" TEXT;

DROP INDEX "PantryItem_userId_normalizedName_key";
CREATE INDEX "PantryItem_userId_normalizedName_idx" ON "PantryItem"("userId", "normalizedName");
