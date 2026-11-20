ALTER TABLE "GroceryList" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Grocery list';

UPDATE "GroceryList" SET "name" = 'My grocery list' WHERE "key" = 'active';
