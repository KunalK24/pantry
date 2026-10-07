/*
  Warnings:

  - A unique constraint covering the columns `[userId,key]` on the table `GroceryList` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,normalizedName]` on the table `PantryItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,weekStart]` on the table `WeeklyPlan` will be added. If there are existing duplicate values, this will fail.
  Existing records are backfilled to a deterministic default user before
  ownership columns are made required.

*/
-- DropIndex
DROP INDEX "GroceryList_importedWeeklyPlanId_idx";

-- DropIndex
DROP INDEX "GroceryList_key_key";

-- DropIndex
DROP INDEX "PantryItem_normalizedName_key";

-- DropIndex
DROP INDEX "WeeklyPlan_weekStart_key";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- BackfillOwner
INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
VALUES (
    'pantry_default_user',
    'default@pantry.local',
    'scrypt$backfill$invalid',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "GroceryList" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "PantryItem" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "WeeklyPlan" ADD COLUMN     "userId" TEXT;

-- BackfillOwnership
UPDATE "GroceryList" SET "userId" = 'pantry_default_user' WHERE "userId" IS NULL;
UPDATE "PantryItem" SET "userId" = 'pantry_default_user' WHERE "userId" IS NULL;
UPDATE "Recipe" SET "userId" = 'pantry_default_user' WHERE "userId" IS NULL;
UPDATE "WeeklyPlan" SET "userId" = 'pantry_default_user' WHERE "userId" IS NULL;

-- RequireOwnership
ALTER TABLE "GroceryList" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PantryItem" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Recipe" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "WeeklyPlan" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "GroceryList_userId_importedWeeklyPlanId_idx" ON "GroceryList"("userId", "importedWeeklyPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryList_userId_key_key" ON "GroceryList"("userId", "key");

-- CreateIndex
CREATE INDEX "PantryItem_userId_idx" ON "PantryItem"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PantryItem_userId_normalizedName_key" ON "PantryItem"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "Recipe_userId_idx" ON "Recipe"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_userId_weekStart_key" ON "WeeklyPlan"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PantryItem" ADD CONSTRAINT "PantryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryList" ADD CONSTRAINT "GroceryList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
