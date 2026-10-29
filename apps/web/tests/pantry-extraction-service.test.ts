import { describe, expect, it } from "vitest";
import {
  extractPantryItems,
  PantryImportError,
} from "@/services/pantry-extraction-service";

describe("pantry extraction input", () => {
  it("rejects non-image bytes before calling Gemini", async () => {
    await expect(
      extractPantryItems({
        type: "image",
        image: {
          mimeType: "image/jpeg",
          data: Buffer.from("plain text").toString("base64"),
        },
      }),
    ).rejects.toMatchObject<Partial<PantryImportError>>({
      code: "invalid_source",
    });
  });

  it("rejects bytes that disagree with the declared image MIME type", async () => {
    await expect(
      extractPantryItems({
        type: "image",
        image: {
          mimeType: "image/png",
          data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString("base64"),
        },
      }),
    ).rejects.toMatchObject<Partial<PantryImportError>>({
      code: "invalid_source",
    });
  });
});
