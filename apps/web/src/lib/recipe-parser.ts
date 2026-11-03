import { scrapeRecipe, type RecipeObject } from "recipe-scrapers";

import { type RecipeInput, recipeInputSchema } from "@/schemas/recipe";

const MAX_HTML_BYTES = 1024 * 1024;
const PARSER_TIMEOUT_MS = 8_000;
const MISSING_DESCRIPTION = "Description unavailable";

const NUMBER = String.raw`(?:\d+(?:[.,]\d+|\/\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])`;
const QUANTITY = new RegExp(
  `^(${NUMBER}(?:\\s+${NUMBER})?(?:\\s*[-–]\\s*${NUMBER})?|to taste|as needed)(?:\\s+|$)(.*)$`,
  "i",
);
const UNITS =
  /^(teaspoons?|tsps?\.?|tablespoons?|tbsps?\.?|tbsp\.?|cups?|ounces?|oz\.?|pounds?|lbs?\.?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|cans?|pinches?|bunches?|slices?|pieces?)\b\.?\s*/i;

export class RecipeParseError extends Error {
  constructor(public readonly code: "incomplete" | "timeout" | "invalid_input") {
    super(code);
    this.name = "RecipeParseError";
  }
}

function parseIngredient(line: string) {
  const cleaned = line.trim().replace(/^[-•*]\s*/, "");
  const match = cleaned.match(QUANTITY);
  if (!match) {
    return null;
  }
  const quantity = match[1].trim();
  let rest = match[2].trim();
  const unitMatch = rest.match(UNITS);
  let unit: string | undefined;
  if (unitMatch) {
    unit = unitMatch[1].replace(/\.$/, "");
    rest = rest.slice(unitMatch[0].length).trim();
  }
  const name = rest.replace(/^of\s+/i, "").trim();
  return name ? { name, quantity, ...(unit ? { unit } : {}) } : null;
}

export function mapScrapedRecipe(scraped: RecipeObject): RecipeInput {
  const ingredientLines = scraped.ingredients.flatMap((group) =>
    group.items.map((item) => item.value),
  );
  const ingredients = ingredientLines.map(parseIngredient);
  if (ingredients.some((item) => item === null)) {
    throw new RecipeParseError("incomplete");
  }
  const instructions = scraped.instructions.flatMap((group) =>
    group.items.map((item) => item.value),
  );
  const mealType = scraped.category
    .map((category) => category.trim().toLowerCase())
    .find((category) => ["breakfast", "lunch", "dinner", "snack"].includes(category));
  const result = recipeInputSchema.safeParse({
    name: scraped.title,
    description: scraped.description === MISSING_DESCRIPTION ? undefined : scraped.description,
    instructions: instructions.join("\n"),
    ingredients,
    mealType,
    timeMinutes: scraped.totalTime ?? undefined,
  });
  if (!result.success) {
    throw new RecipeParseError("incomplete");
  }
  return result.data;
}

export async function parseRecipeHtml(
  url: string,
  html: string,
  signal?: AbortSignal,
): Promise<RecipeInput> {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new RecipeParseError("invalid_input");
  }
  if (signal?.aborted) {
    throw new RecipeParseError("timeout");
  }
  const deadline = AbortSignal.timeout(PARSER_TIMEOUT_MS);
  let rejectTimeout: (reason: RecipeParseError) => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });
  const onAbort = () => rejectTimeout(new RecipeParseError("timeout"));
  deadline.addEventListener("abort", onAbort, { once: true });
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const parsed = await Promise.race([
      scrapeRecipe(html, url, {
        fallbackAuthor: "Unknown author",
        fallbackDescription: MISSING_DESCRIPTION,
        fallbackImage: "https://example.invalid/recipe-image",
        fallbackYield: "Unknown yield",
      }),
      timeout,
    ]);
    if (signal?.aborted) {
      throw new RecipeParseError("timeout");
    }
    return mapScrapedRecipe(parsed);
  } finally {
    deadline.removeEventListener("abort", onAbort);
    signal?.removeEventListener("abort", onAbort);
  }
}
