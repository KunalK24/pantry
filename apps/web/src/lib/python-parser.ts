import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

import { type RecipeInput, recipeInputSchema } from "@/schemas/recipe";

const MAX_HTML_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024;
const PARSER_TIMEOUT_MS = 8_000;

const scrapedRecipeSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  ingredients: z.array(z.string().trim().min(1)).min(1),
  instructions: z.array(z.string().trim().min(1)).min(1),
});

export type PythonRecipeParseErrorCode =
  | "incomplete"
  | "unavailable"
  | "timeout"
  | "invalid_output";

export class PythonRecipeParseError extends Error {
  constructor(
    public readonly code: PythonRecipeParseErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "PythonRecipeParseError";
  }
}

const NUMBER = String.raw`(?:\d+(?:[.,]\d+|\/\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])`;
const QUANTITY = new RegExp(
  `^(${NUMBER}(?:\\s+${NUMBER})?(?:\\s*[-–]\\s*${NUMBER})?|to taste|as needed)(?:\\s+|$)(.*)$`,
  "i",
);
const UNITS =
  /^(teaspoons?|tsps?\.?|tablespoons?|tbsps?\.?|tbsp\.?|cups?|ounces?|oz\.?|pounds?|lbs?\.?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|cans?|pinches?|bunches?|slices?|pieces?)\b\.?\s*/i;

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

export function mapScrapedRecipe(value: unknown): RecipeInput {
  const scraped = scrapedRecipeSchema.safeParse(value);
  if (!scraped.success) {
    throw new PythonRecipeParseError("incomplete", { cause: scraped.error });
  }
  const ingredients = scraped.data.ingredients.map(parseIngredient);
  if (ingredients.some((item) => item === null)) {
    throw new PythonRecipeParseError("incomplete");
  }
  const result = recipeInputSchema.safeParse({
    name: scraped.data.name,
    description: scraped.data.description || undefined,
    instructions: scraped.data.instructions.join("\n"),
    ingredients,
  });
  if (!result.success) {
    throw new PythonRecipeParseError("incomplete", { cause: result.error });
  }
  return result.data;
}

export async function parseRecipeWithPython(
  url: string,
  html: string,
  signal?: AbortSignal,
): Promise<RecipeInput> {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new PythonRecipeParseError("invalid_output");
  }
  if (signal?.aborted) {
    throw new PythonRecipeParseError("timeout", { cause: signal.reason });
  }
  const workspacePython = resolve(process.cwd(), "../../.venv/bin/python");
  const python =
    process.env.PYTHON_BIN ||
    (existsSync(workspacePython) ? workspacePython : "python3");
  const script = resolve(process.cwd(), "scripts/parse_recipe.py");

  return await new Promise<RecipeInput>((resolvePromise, rejectPromise) => {
    const child = spawn(python, [script], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let outputBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      finish(new PythonRecipeParseError("timeout"));
    }, PARSER_TIMEOUT_MS);
    const onAbort = () => {
      child.kill();
      finish(new PythonRecipeParseError("timeout", { cause: signal?.reason }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    function finish(error?: Error, result?: RecipeInput) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (error) {
        rejectPromise(error);
      } else if (result) {
        resolvePromise(result);
      }
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(new PythonRecipeParseError("invalid_output"));
      } else {
        stdout += chunk;
      }
    });
    child.stderr.resume();
    child.on("error", (error) =>
      finish(new PythonRecipeParseError("unavailable", { cause: error })),
    );
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        return finish(new PythonRecipeParseError("incomplete"));
      }
      try {
        finish(undefined, mapScrapedRecipe(JSON.parse(stdout)));
      } catch (error) {
        finish(
          error instanceof PythonRecipeParseError
            ? error
            : new PythonRecipeParseError("invalid_output", { cause: error }),
        );
      }
    });
    child.stdin.on("error", (error) =>
      finish(new PythonRecipeParseError("unavailable", { cause: error })),
    );
    child.stdin.end(JSON.stringify({ url, html }));
  });
}
