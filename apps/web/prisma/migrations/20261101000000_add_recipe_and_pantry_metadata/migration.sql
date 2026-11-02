ALTER TABLE "Recipe"
  ADD COLUMN "mealType" TEXT,
  ADD COLUMN "timeMinutes" INTEGER,
  ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PantryItem"
  ADD COLUMN "location" TEXT,
  ADD COLUMN "expiresOn" DATE;
