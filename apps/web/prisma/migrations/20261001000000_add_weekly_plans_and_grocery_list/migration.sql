-- CreateEnum
CREATE TYPE "GroceryRecipeSource" AS ENUM ('MANUAL', 'WEEKLY_PLAN');

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedMeal" (
    "id" TEXT NOT NULL,
    "weeklyPlanId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PlannedMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryList" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "importedWeeklyPlanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroceryList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryListRecipe" (
    "id" TEXT NOT NULL,
    "groceryListId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "source" "GroceryRecipeSource" NOT NULL,

    CONSTRAINT "GroceryListRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryItem" (
    "id" TEXT NOT NULL,
    "groceryListId" TEXT NOT NULL,
    "pantryItemId" TEXT,
    "lineKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseQuantity" TEXT NOT NULL,
    "baseUnit" TEXT NOT NULL,
    "quantityOverride" TEXT,
    "unitOverride" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroceryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_weekStart_key" ON "WeeklyPlan"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedMeal_weeklyPlanId_dayOffset_position_key" ON "PlannedMeal"("weeklyPlanId", "dayOffset", "position");

-- CreateIndex
CREATE INDEX "PlannedMeal_recipeId_idx" ON "PlannedMeal"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryList_key_key" ON "GroceryList"("key");

-- CreateIndex
CREATE INDEX "GroceryList_importedWeeklyPlanId_idx" ON "GroceryList"("importedWeeklyPlanId");

-- CreateIndex
CREATE INDEX "GroceryListRecipe_groceryListId_idx" ON "GroceryListRecipe"("groceryListId");

-- CreateIndex
CREATE INDEX "GroceryListRecipe_recipeId_idx" ON "GroceryListRecipe"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryItem_groceryListId_lineKey_key" ON "GroceryItem"("groceryListId", "lineKey");

-- CreateIndex
CREATE INDEX "GroceryItem_pantryItemId_idx" ON "GroceryItem"("pantryItemId");

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryList" ADD CONSTRAINT "GroceryList_importedWeeklyPlanId_fkey" FOREIGN KEY ("importedWeeklyPlanId") REFERENCES "WeeklyPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListRecipe" ADD CONSTRAINT "GroceryListRecipe_groceryListId_fkey" FOREIGN KEY ("groceryListId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListRecipe" ADD CONSTRAINT "GroceryListRecipe_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItem" ADD CONSTRAINT "GroceryItem_groceryListId_fkey" FOREIGN KEY ("groceryListId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItem" ADD CONSTRAINT "GroceryItem_pantryItemId_fkey" FOREIGN KEY ("pantryItemId") REFERENCES "PantryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
