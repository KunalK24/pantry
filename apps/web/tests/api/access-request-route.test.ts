import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkRateLimitMock, sendRequestMock, DeliveryError } = vi.hoisted(() => {
  class DeliveryError extends Error {}
  return {
    checkRateLimitMock: vi.fn(),
    sendRequestMock: vi.fn(),
    DeliveryError,
  };
});

vi.mock("@/lib/auth-rate-limit", () => ({
  checkAuthRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/auth", () => ({
  checkRequestOrigin: (request: Request) =>
    request.headers.get("origin") === "http://localhost:3000"
      ? null
      : Response.json({ error: "Forbidden origin" }, { status: 403 }),
}));

vi.mock("@/services/access-request-service", () => ({
  AccessRequestDeliveryError: DeliveryError,
  sendAccessRequest: sendRequestMock,
}));

import { POST } from "@/app/api/access-requests/route";

const validBody = {
  name: "Jamie Cook",
  email: " Jamie@Example.COM ",
  reason: "I would like to test meal planning with my family.",
};

function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/access-requests", {
    method: "POST",
    headers: { origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_ORIGIN", "");
  checkRateLimitMock.mockResolvedValue({ status: "allowed" });
  sendRequestMock.mockResolvedValue(undefined);
});

describe("POST /api/access-requests", () => {
  it("normalizes the request and accepts only after notification succeeds", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ message: "Request received" });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "access-request",
      "jamie@example.com",
      expect.any(Request),
    );
    expect(sendRequestMock).toHaveBeenCalledWith({
      ...validBody,
      email: "jamie@example.com",
    });
  });

  it("rejects blank reasons before calling the provider", async () => {
    const response = await POST(request({ ...validBody, reason: "   " }));
    expect(response.status).toBe(400);
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it("rejects a mismatched origin", async () => {
    const response = await POST(request(validBody, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const response = await POST(request({ ...validBody, reason: "x".repeat(9_000) }));
    expect(response.status).toBe(413);
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it("returns retry timing when rate limited", async () => {
    checkRateLimitMock.mockResolvedValue({ status: "limited", retryAfterSeconds: 90 });
    const response = await POST(request(validBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("90");
    expect(sendRequestMock).not.toHaveBeenCalled();
  });

  it("reports unavailable when notification fails", async () => {
    sendRequestMock.mockRejectedValue(new DeliveryError());
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
  });
});
