import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn(async () => ({
    user: { id: "live-test-user" },
    response: null,
  })),
}));

import { POST } from "@/app/api/pantry-extractions/route";

it.skipIf(process.env.PANTRY_LIVE_TEST !== "1")(
  "extracts pantry items from docs/test_image.jpg through POST",
  async () => {
    config({ path: resolve(process.cwd(), ".env"), quiet: true });
    const image = readFileSync(
      resolve(process.cwd(), "../../docs/test_image.jpg"),
    );
    const request = new Request("http://localhost/api/pantry-extractions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "image",
        image: { mimeType: "image/jpeg", data: image.toString("base64") },
      }),
    });
    const response = await POST(request);
    const body = await response.json();
    process.stdout.write(
      `Live pantry extraction: ${JSON.stringify({ status: response.status, body })}\n`,
    );
    expect(response.status).toBe(200);
    expect(Array.isArray(body.items)).toBe(true);
  },
  50_000,
);
