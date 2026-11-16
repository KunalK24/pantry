import { describe, expect, it } from "vitest";
import {
  imageDataError,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REQUEST_BYTES,
} from "./image-upload";

describe("Vercel image payload limits", () => {
  it("fits an image at the cap in a JSON request", () => {
    const data = Buffer.alloc(MAX_IMAGE_BYTES).toString("base64");
    const body = JSON.stringify({ type: "image", image: { mimeType: "image/jpeg", data } });

    expect(Buffer.byteLength(body)).toBeLessThan(MAX_IMAGE_REQUEST_BYTES);
    expect(imageDataError(data)).toBeNull();
  });

  it("rejects an image over the decoded cap", () => {
    expect(imageDataError(Buffer.alloc(MAX_IMAGE_BYTES + 1).toString("base64"))).toBe(413);
  });
});
