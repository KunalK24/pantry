import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  listGroceryLists: vi.fn(),
  createGroceryList: vi.fn(),
  getGroceryList: vi.fn(),
  saveGroceryList: vi.fn(),
  renameGroceryList: vi.fn(),
  deleteGroceryList: vi.fn(),
}));

const conflict = vi.hoisted(() => ({
  ErrorClass: class NamedGroceryListRevisionConflictError extends Error {},
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("@/services/named-grocery-list-service", () => ({
  ...mocks,
  NamedGroceryListNotFoundError: class NamedGroceryListNotFoundError extends Error {},
  NamedGroceryListReferenceError: class NamedGroceryListReferenceError extends Error {},
  NamedGroceryListRevisionConflictError: conflict.ErrorClass,
}));

import { GET as getLists, POST } from "@/app/api/grocery-lists/route";
import { GET, PUT, PATCH, DELETE } from "@/app/api/grocery-lists/[id]/route";

const id = "cm42345678901234567890123";
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAuth.mockResolvedValue({ user: { id: "user-1" }, response: null });
});

describe("named grocery list routes", () => {
  it("lists a user's lists", async () => {
    mocks.listGroceryLists.mockResolvedValue([{ id, name: "Weekly", itemCount: 2 }]);
    const response = await getLists(new Request("http://localhost/api/grocery-lists"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lists: [{ id, name: "Weekly", itemCount: 2 }] });
    expect(mocks.listGroceryLists).toHaveBeenCalledWith("user-1");
  });

  it("creates a named list with trimmed name", async () => {
    mocks.createGroceryList.mockResolvedValue({ id, name: "Weekly" });
    const response = await POST(new Request("http://localhost/api/grocery-lists", {
      method: "POST",
      body: JSON.stringify({ name: " Weekly " }),
    }));
    expect(response.status).toBe(201);
    expect(mocks.createGroceryList).toHaveBeenCalledWith("user-1", "Weekly");
  });

  it("rejects blank list names", async () => {
    const response = await POST(new Request("http://localhost/api/grocery-lists", {
      method: "POST",
      body: JSON.stringify({ name: "  " }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.createGroceryList).not.toHaveBeenCalled();
  });

  it("loads and replaces one list", async () => {
    mocks.getGroceryList.mockResolvedValue({ id, name: "Weekly" });
    const getResponse = await GET(new Request("http://localhost"), context);
    expect(getResponse.status).toBe(200);
    expect(mocks.getGroceryList).toHaveBeenCalledWith("user-1", id);

    const input = { expectedRevision: 0, importedWeeklyPlanId: null, recipes: [], items: [] };
    mocks.saveGroceryList.mockResolvedValue({ id, ...input });
    const putResponse = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify(input),
    }), context);
    expect(putResponse.status).toBe(200);
    expect(mocks.saveGroceryList).toHaveBeenCalledWith("user-1", id, input);
  });

  it("requires a revision for list replacement and rename", async () => {
    const putResponse = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ importedWeeklyPlanId: null, recipes: [], items: [] }),
    }), context);
    expect(putResponse.status).toBe(400);
    expect(mocks.saveGroceryList).not.toHaveBeenCalled();

    const patchResponse = await PATCH(new Request("http://localhost", {
      method: "PATCH", body: JSON.stringify({ name: "Market" }),
    }), context);
    expect(patchResponse.status).toBe(400);
    expect(mocks.renameGroceryList).not.toHaveBeenCalled();
  });

  it("renames and deletes a list", async () => {
    mocks.renameGroceryList.mockResolvedValue({ id, name: "Market" });
    const patchResponse = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ name: "Market", expectedRevision: 0 }),
    }), context);
    expect(patchResponse.status).toBe(200);
    expect(mocks.renameGroceryList).toHaveBeenCalledWith("user-1", id, "Market", 0);

    const deleteResponse = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(deleteResponse.status).toBe(204);
    expect(mocks.deleteGroceryList).toHaveBeenCalledWith("user-1", id);
  });

  it("returns 404 for a missing list", async () => {
    mocks.getGroceryList.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), context);
    expect(response.status).toBe(404);
  });

  it("returns 409 with a stable code for stale PUT and PATCH", async () => {
    mocks.saveGroceryList.mockRejectedValue(new conflict.ErrorClass());
    const putResponse = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: 2, importedWeeklyPlanId: null, recipes: [], items: [] }),
    }), context);
    expect(putResponse.status).toBe(409);
    expect(await putResponse.json()).toEqual({
      error: "Grocery list changed since it was loaded", code: "REVISION_CONFLICT",
    });

    mocks.renameGroceryList.mockRejectedValue(new conflict.ErrorClass());
    const patchResponse = await PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ name: "Updated", expectedRevision: 2 }),
    }), context);
    expect(patchResponse.status).toBe(409);
    expect(await patchResponse.json()).toEqual({
      error: "Grocery list changed since it was loaded", code: "REVISION_CONFLICT",
    });
  });
});
