ALTER TABLE "AiJob" ALTER COLUMN "inputJson" DROP NOT NULL;
ALTER TABLE "AiJob" ADD COLUMN "sourceType" TEXT;
UPDATE "AiJob" SET "sourceType" = "inputJson"->>'type' WHERE "type" = 'RECIPE_IMPORT';
UPDATE "AiJob" SET "inputJson" = NULL
WHERE "status" IN ('SUCCEEDED', 'FAILED', 'CANCELED');
