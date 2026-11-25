import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AccessRequestDeliveryError,
  sendAccessRequest,
} from "@/services/access-request-service";

const input = {
  name: "Jamie Cook",
  email: "jamie@example.com",
  reason: "I would like to test meal planning.",
};

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("ACCESS_REQUEST_FROM_EMAIL", "Pantry <requests@example.com>");
  vi.stubEnv("ACCESS_REQUEST_TO_EMAIL", "owner@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("access request notification", () => {
  it("sends the review details to the configured recipient", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendAccessRequest(input);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(options.body)).toMatchObject({
      from: "Pantry <requests@example.com>",
      to: ["owner@example.com"],
      subject: "Pantry access request",
      text: expect.stringContaining(input.reason),
    });
  });

  it("fails closed when notification configuration is missing", async () => {
    vi.stubEnv("ACCESS_REQUEST_TO_EMAIL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendAccessRequest(input)).rejects.toBeInstanceOf(AccessRequestDeliveryError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed if Resend rejects the request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(sendAccessRequest(input)).rejects.toBeInstanceOf(AccessRequestDeliveryError);
  });
});
