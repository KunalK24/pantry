-- AlterTable
ALTER TABLE "Recipe"
ADD COLUMN "description" TEXT,
ADD COLUMN "instructions" TEXT;

-- AlterTable
ALTER TABLE "RecipeIngredient"
ALTER COLUMN "quantity" TYPE TEXT USING "quantity"::TEXT;
