import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getWeeklyPlanMock,
  saveWeeklyPlanMock,
  WeeklyPlanReferenceErrorMock,
  WeeklyPlanRevisionConflictErrorMock,
  requireAuthMock,
} = vi.hoisted(() => {
  class WeeklyPlanReferenceErrorMock extends Error {}
  class WeeklyPlanRevisionConflictErrorMock extends Error {}

  return {
    getWeeklyPlanMock: vi.fn(),
    saveWeeklyPlanMock: vi.fn(),
    WeeklyPlanReferenceErrorMock,
    WeeklyPlanRevisionConflictErrorMock,
    requireAuthMock: vi.fn(),
  };
});

vi.mock("@/services/weekly-plan-service", () => ({
  getWeeklyPlan: getWeeklyPlanMock,
  saveWeeklyPlan: saveWeeklyPlanMock,
  WeeklyPlanReferenceError: WeeklyPlanReferenceErrorMock,
  WeeklyPlanRevisionConflictError: WeeklyPlanRevisionConflictErrorMock,
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: requireAuthMock,
}));

import { GET, PUT } from "@/app/api/weekly-plans/[weekStart]/route";

const recipeId = "cm12345678901234567890123";
const userId = "auth-user";
const authUser = { id: userId, email: "cook@example.com" };
const weekStart = "2026-09-28";
const context = (value = weekStart) => ({
  params: Promise.resolve({ weekStart: value }),
});
const plan = {
  id: "cm22345678901234567890123",
  weekStart,
  revision: 0,
  updatedAt: "2026-10-01T12:00:00.000Z",
  meals: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue({ user: authUser, response: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/weekly-plans/[weekStart]", () => {
  it.each(["2026-09-29", "2026-02-30", "2026-9-28", "not-a-date"])(
    "rejects invalid or non-Monday date %s",
    async (value) => {
      const response = await GET(
        new Request("http://localhost"),
        context(value),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "Invalid week start",
      });
      expect(getWeeklyPlanMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["an absent week", null],
    ["a saved week", plan],
  ])("returns %s", async (_case, savedPlan) => {
    getWeeklyPlanMock.mockResolvedValue(savedPlan);

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ plan: savedPlan });
    expect(getWeeklyPlanMock).toHaveBeenCalledWith(userId, weekStart);
  });

  it("returns 401 when unauthenticated", async () => {
    requireAuthMock.mockResolvedValue({
      user: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getWeeklyPlanMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/weekly-plans/[weekStart]", () => {
  it("requires an explicit revision precondition", async () => {
    const response = await PUT(new Request("http://localhost", {
      method: "PUT", body: JSON.stringify({ meals: [] }),
    }), context());
    expect(response.status).toBe(400);
    expect(saveWeeklyPlanMock).not.toHaveBeenCalled();
  });

  it("validates and saves a complete weekly snapshot", async () => {
    const input = {
      expectedRevision: null,
      meals: [
        { recipeId, dayOffset: 0, position: 0, mealSlot: "breakfast" },
        { recipeId, dayOffset: 0, position: 1, mealSlot: "snacks" },
      ],
    };
    saveWeeklyPlanMock.mockResolvedValue(plan);
    const request = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify(input),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ plan });
    expect(saveWeeklyPlanMock).toHaveBeenCalledWith(userId, weekStart, input);
  });

  it("accepts existing clients that do not send a meal type", async () => {
    const input = { expectedRevision: null, meals: [{ recipeId, dayOffset: 0, position: 0 }] };
    saveWeeklyPlanMock.mockResolvedValue(plan);

    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify(input),
    }), context());

    expect(response.status).toBe(200);
    expect(saveWeeklyPlanMock).toHaveBeenCalledWith(userId, weekStart, input);
  });

  it.each([
    ["day out of range", [{ recipeId, dayOffset: 7, position: 0 }]],
    ["negative position", [{ recipeId, dayOffset: 0, position: -1 }]],
    ["invalid meal type", [{ recipeId, dayOffset: 0, position: 0, mealSlot: "brunch" }]],
    [
      "duplicate position",
      [
        { recipeId, dayOffset: 0, position: 0 },
        { recipeId, dayOffset: 0, position: 0 },
      ],
    ],
    ["non-contiguous positions", [{ recipeId, dayOffset: 0, position: 1 }]],
    [
      "invalid recipe ID",
      [{ recipeId: "recipe-1", dayOffset: 0, position: 0 }],
    ],
  ])("returns 400 for %s", async (_case, meals) => {
    const request = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: null, meals }),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(400);
    expect(saveWeeklyPlanMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const request = new Request("http://localhost", {
      method: "PUT",
      body: "{",
    });
    const response = await PUT(request, context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Malformed JSON" });
  });

  it("returns a safe 400 for an unknown recipe", async () => {
    saveWeeklyPlanMock.mockRejectedValue(new WeeklyPlanReferenceErrorMock());
    const request = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        meals: [{ recipeId, dayOffset: 0, position: 0 }],
        expectedRevision: null,
      }),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Weekly plan references an unknown recipe",
    });
  });

  it("does not expose unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    saveWeeklyPlanMock.mockRejectedValue(new Error("database internals"));
    const request = new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ meals: [], expectedRevision: null }),
    });

    const response = await PUT(request, context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal Server Error",
    });
  });

  it("returns 409 with a stable code for stale revisions", async () => {
    saveWeeklyPlanMock.mockRejectedValue(new WeeklyPlanRevisionConflictErrorMock());
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ meals: [], expectedRevision: 2 }),
    }), context());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Weekly plan changed since it was loaded", code: "REVISION_CONFLICT",
    });
  });
});
