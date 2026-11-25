export type GroceryItem = {
  lineKey: string;
  name: string;
  baseQuantity: string;
  baseUnit: string;
  quantityOverride: string | null;
  unitOverride: string | null;
  checked: boolean;
  dismissed: boolean;
  pantryItemId: string | null;
};

export type GroceryList = {
  id: string;
  name: string;
  revision: number;
  importedWeeklyPlanId: string | null;
  updatedAt: string;
  recipes: { recipeId: string; source: "MANUAL" | "WEEKLY_PLAN" }[];
  items: GroceryItem[];
};

export type GroceryListSummary = {
  id: string;
  name: string;
  updatedAt: string;
  itemCount: number;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

function isGroceryItem(value: unknown): value is GroceryItem {
  return isObject(value) && typeof value.lineKey === "string" && typeof value.name === "string" &&
    typeof value.baseQuantity === "string" && typeof value.baseUnit === "string" &&
    isNullableString(value.quantityOverride) && isNullableString(value.unitOverride) &&
    typeof value.checked === "boolean" && typeof value.dismissed === "boolean" &&
    isNullableString(value.pantryItemId);
}

function isGroceryList(value: unknown): value is GroceryList {
  return isObject(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    isNullableString(value.importedWeeklyPlanId) && typeof value.updatedAt === "string" &&
    Array.isArray(value.recipes) && value.recipes.every((recipe) =>
      isObject(recipe) && typeof recipe.recipeId === "string" &&
      (recipe.source === "MANUAL" || recipe.source === "WEEKLY_PLAN")) &&
    Array.isArray(value.items) && value.items.every(isGroceryItem);
}

export function isGroceryListsResponse(value: unknown): value is { lists: GroceryListSummary[] } {
  return isObject(value) && Array.isArray(value.lists) && value.lists.every((list) =>
    isObject(list) && typeof list.id === "string" && typeof list.name === "string" &&
    typeof list.updatedAt === "string" && typeof list.itemCount === "number" &&
    Number.isSafeInteger(list.itemCount) && list.itemCount >= 0);
}

export function isGroceryListResponse(value: unknown): value is { list: GroceryList } {
  return isObject(value) && isGroceryList(value.list);
}

