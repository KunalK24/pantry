ALTER TABLE "Recipe" ADD COLUMN "instructionSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Recipe"
SET "instructionSteps" = COALESCE(
  (
    SELECT array_agg(normalized_step ORDER BY position)
    FROM (
      SELECT regexp_replace(
        trim(step),
        '^(step[[:space:]]+[0-9]+[:.)]|[0-9]+[.)]|[-*•●])[[:space:]]+',
        '',
        'i'
      ) AS normalized_step,
        position
      FROM regexp_split_to_table(COALESCE("instructions", ''), E'\r\n|\n|\r')
        WITH ORDINALITY AS lines(step, position)
      WHERE trim(step) <> ''
    ) AS steps
    WHERE normalized_step <> ''
  ),
  ARRAY[]::TEXT[]
);

ALTER TABLE "Recipe" DROP COLUMN "instructions";
ALTER TABLE "Recipe" RENAME COLUMN "instructionSteps" TO "instructions";
