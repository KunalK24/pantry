import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import http from "node:http";
import { lookup } from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchRecipeHtml } from "./recipe-url-acquisition-service";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:http", () => ({ default: { request: vi.fn() } }));

type FakePage = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

function mockPages(pages: FakePage[]) {
  const calls: URL[] = [];
  vi.mocked(lookup).mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
  ] as never);
  vi.mocked(http.request).mockImplementation((url, options, callback) => {
    const page = pages.shift();
    if (!page) {
      throw new Error("unexpected request");
    }
    calls.push(url as URL);
    const request = new EventEmitter() as ReturnType<typeof http.request>;
    request.end = () => {
      const response = Readable.from([
        Buffer.from(page.body || ""),
      ]) as http.IncomingMessage;
      response.statusCode = page.status;
      response.headers = page.headers || { "content-type": "text/html" };
      queueMicrotask(() => callback!(response));
      return request;
    };
    request.destroy = () => request;
    // Exercise the exact socket lookup supplied by the fetcher.
    const pinnedLookup = options?.lookup;
    if (typeof pinnedLookup === "function") {
      pinnedLookup("example.com", {}, (_error, address) => {
        expect(address).toBe("93.184.216.34");
      });
    }
    return request;
  });
  return calls;
}

afterEach(() => vi.clearAllMocks());

describe("recipe URL acquisition", () => {
  it.each([
    "file:///etc/passwd",
    "http://localhost/recipe",
    "http://127.0.0.1/recipe",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/recipe",
    "http://[::1]/recipe",
    "https://user:pass@example.com/recipe",
    "http://host.internal/recipe",
  ])("rejects unsafe URL %s before a socket opens", async (url) => {
    await expect(fetchRecipeHtml(url)).rejects.toMatchObject({
      code: "unsafe_url",
    });
    expect(http.request).not.toHaveBeenCalled();
  });

  it("returns bounded HTML for a public URL", async () => {
    mockPages([{ status: 200, body: "<html>Recipe</html>" }]);
    await expect(fetchRecipeHtml("http://example.com/recipe")).resolves.toEqual(
      { html: "<html>Recipe</html>", finalUrl: "http://example.com/recipe" },
    );
  });

  it("validates and follows a public redirect", async () => {
    const calls = mockPages([
      { status: 302, headers: { location: "http://example.com/final" } },
      { status: 200, body: "<html>Recipe</html>" },
    ]);
    await expect(
      fetchRecipeHtml("http://example.com/start"),
    ).resolves.toMatchObject({ finalUrl: "http://example.com/final" });
    expect(calls).toHaveLength(2);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe redirect targets", async () => {
    mockPages([
      { status: 302, headers: { location: "http://127.0.0.1/private" } },
    ]);
    await expect(
      fetchRecipeHtml("http://example.com/start"),
    ).rejects.toMatchObject({ code: "unsafe_url" });
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ status: 403 }, "access_denied"],
    [
      { status: 200, body: "<html>Verify you are human</html>" },
      "access_denied",
    ],
    [
      {
        status: 200,
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      "invalid_source",
    ],
    [
      {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "2000000" },
      },
      "too_large",
    ],
    [{ status: 200, body: "a".repeat(1024 * 1024 + 1) }, "too_large"],
  ] as const)(
    "rejects blocked, non-HTML, and oversized responses",
    async (page, code) => {
      mockPages([{ ...page }]);
      await expect(
        fetchRecipeHtml("http://example.com/recipe"),
      ).rejects.toMatchObject({ code });
    },
  );

  it("rejects DNS rebinding to private space before a connection", async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await expect(
      fetchRecipeHtml("http://example.com/recipe"),
    ).rejects.toMatchObject({ code: "unsafe_url" });
    expect(http.request).not.toHaveBeenCalled();
  });
});
