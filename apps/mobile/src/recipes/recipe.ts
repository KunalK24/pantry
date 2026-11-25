export type RecipeIngredient = {
  name: string;
  quantity: string | null;
  unit: string | null;
};

export type RecipeSummary = {
  id: string;
  name: string;
  description: string | null;
  mealType: "breakfast" | "lunch" | "dinner" | "snack" | "dessert" | null;
  timeMinutes: number | null;
  isFavorite: boolean;
  imageUrl: string | null;
  ingredients: RecipeIngredient[];
};

export type RecipeDetail = RecipeSummary & { instructions: string[] };

export function isSafeRecipeId(value: string): boolean {
  return value.length <= 100 && /^[A-Za-z0-9_-]+$/.test(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isIngredient(value: unknown): value is RecipeIngredient {
  return typeof value === "object" && value !== null &&
    "name" in value && typeof value.name === "string" &&
    "quantity" in value && isNullableString(value.quantity) &&
    "unit" in value && isNullableString(value.unit);
}

export function isRecipeSummary(value: unknown): value is RecipeSummary {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || typeof value.id !== "string" || !isSafeRecipeId(value.id)) return false;
  return "name" in value && typeof value.name === "string" &&
    "description" in value && isNullableString(value.description) &&
    "mealType" in value && (value.mealType === null ||
      (typeof value.mealType === "string" && ["breakfast", "lunch", "dinner", "snack", "dessert"].includes(value.mealType))) &&
    "timeMinutes" in value && (value.timeMinutes === null ||
      (typeof value.timeMinutes === "number" && Number.isSafeInteger(value.timeMinutes) && value.timeMinutes > 0)) &&
    "isFavorite" in value && typeof value.isFavorite === "boolean" &&
    "imageUrl" in value && (value.imageUrl === null ||
      value.imageUrl === `/api/recipes/${value.id}/image`) &&
    "ingredients" in value && Array.isArray(value.ingredients) && value.ingredients.every(isIngredient);
}

export function isRecipeList(value: unknown): value is { recipes: RecipeSummary[] } {
  return typeof value === "object" && value !== null &&
    "recipes" in value && Array.isArray(value.recipes) && value.recipes.every(isRecipeSummary);
}

export function isRecipeDetail(value: unknown): value is RecipeDetail {
  return isRecipeSummary(value) &&
    "instructions" in value && Array.isArray(value.instructions) &&
    value.instructions.every((step) => typeof step === "string");
}

export function filterRecipes(recipes: RecipeSummary[], query: string): RecipeSummary[] {
  const term = query.trim().toLowerCase();
  if (!term) return recipes;
  return recipes.filter((recipe) => [
    recipe.name,
    recipe.description ?? "",
    ...recipe.ingredients.map((ingredient) => ingredient.name),
  ].join(" ").toLowerCase().includes(term));
}

export function formatMealType(mealType: RecipeSummary["mealType"]): string | null {
  return mealType ? `${mealType[0].toUpperCase()}${mealType.slice(1)}` : null;
}
