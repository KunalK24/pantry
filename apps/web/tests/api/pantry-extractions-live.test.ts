import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { expect, it } from "vitest";
import { extractPantryItems } from "@/services/pantry-extraction-service";

it.skipIf(process.env.PANTRY_LIVE_TEST !== "1")(
  "extracts pantry items from docs/test_image.jpg through Gemini service",
  async () => {
    config({ path: resolve(process.cwd(), ".env"), quiet: true });
    const image = readFileSync(
      resolve(process.cwd(), "../../docs/test_image.jpg"),
    );
    const items = await extractPantryItems({
        type: "image",
        image: { mimeType: "image/jpeg", data: image.toString("base64") },
    });
    process.stdout.write(
      `Live pantry extraction: ${JSON.stringify({ items })}\n`,
    );
    expect(Array.isArray(items)).toBe(true);
  },
  50_000,
);
