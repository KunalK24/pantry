import type { PantryItemInput } from "@/schemas/pantry-item";
import type { RecipeInput } from "@/schemas/recipe";

export const TEST_USER_ID = "pantry_test_fixture_user_v1";
export const TEST_USER_EMAIL = "pantry-test@example.com";

type FixturePantryItem = {
  name: string;
  quantity: string;
  unit: string | null;
  location: NonNullable<PantryItemInput["location"]>;
  expirationOffsetDays?: number;
};

export const pantryItems = [
  { name: "Eggs", quantity: "12", unit: null, location: "Fridge", expirationOffsetDays: 7 },
  { name: "Milk", quantity: "1", unit: "liter", location: "Fridge", expirationOffsetDays: 2 },
  { name: "Butter", quantity: "250", unit: "g", location: "Fridge", expirationOffsetDays: 21 },
  { name: "Bread", quantity: "1", unit: "loaf", location: "Cupboard", expirationOffsetDays: 3 },
  { name: "Rice", quantity: "1", unit: "kg", location: "Pantry" },
  { name: "Pasta", quantity: "500", unit: "g", location: "Pantry" },
  { name: "Canned tomatoes", quantity: "2", unit: "cans", location: "Cupboard" },
  { name: "Onion", quantity: "4", unit: null, location: "Pantry" },
  { name: "Garlic", quantity: "1", unit: "bulb", location: "Pantry" },
  { name: "Cinnamon", quantity: "1", unit: "jar", location: "Spice Cabinet" },
  { name: "Olive oil", quantity: "500", unit: "ml", location: "Cupboard" },
  { name: "Chicken breast", quantity: "600", unit: "g", location: "Freezer", expirationOffsetDays: 30 },
  { name: "Black beans", quantity: "2", unit: "cans", location: "Cupboard" },
  { name: "Tortillas", quantity: "8", unit: null, location: "Cupboard", expirationOffsetDays: 8 },
  { name: "Cheddar", quantity: "200", unit: "g", location: "Fridge", expirationOffsetDays: 14 },
  { name: "Spinach", quantity: "200", unit: "g", location: "Fridge", expirationOffsetDays: 1 },
  { name: "Potatoes", quantity: "1", unit: "kg", location: "Pantry" },
  { name: "Carrots", quantity: "5", unit: null, location: "Fridge", expirationOffsetDays: 10 },
  { name: "Lemons", quantity: "3", unit: null, location: "Fridge", expirationOffsetDays: 9 },
  { name: "Oats", quantity: "500", unit: "g", location: "Pantry" },
  { name: "Yogurt", quantity: "500", unit: "g", location: "Fridge", expirationOffsetDays: -1 },
] satisfies FixturePantryItem[];

type FixtureIngredient = { name: string; quantity: string; unit?: string };
type FixtureRecipe = {
  name: string;
  description: string;
  instructions: string;
  mealType: NonNullable<RecipeInput["mealType"]>;
  timeMinutes: number;
  isFavorite?: boolean;
  ingredients: FixtureIngredient[];
};

export const recipes: FixtureRecipe[] = [
  { name: "Tomato Pasta", description: "A simple pantry pasta.", instructions: "Cook pasta. Soften onion and garlic in oil, add tomatoes, then toss with pasta.", mealType: "dinner", timeMinutes: 30, isFavorite: true, ingredients: [{ name: "Pasta", quantity: "200", unit: "g" }, { name: "Canned tomatoes", quantity: "1", unit: "can" }, { name: "Onion", quantity: "1" }, { name: "Garlic", quantity: "2", unit: "cloves" }, { name: "Olive oil", quantity: "2", unit: "tbsp" }] },
  { name: "Chicken and Rice", description: "One-pan chicken dinner.", instructions: "Brown chicken and onion. Add rice and water; simmer until cooked. Finish with lemon.", mealType: "dinner", timeMinutes: 40, ingredients: [{ name: "Chicken breast", quantity: "300", unit: "g" }, { name: "Rice", quantity: "1", unit: "cup" }, { name: "Onion", quantity: "1" }, { name: "Lemons", quantity: "1" }] },
  { name: "Bean Quesadillas", description: "Crisp tortillas with beans and cheese.", instructions: "Fill tortillas with beans and cheddar. Cook in a skillet until golden.", mealType: "snack", timeMinutes: 15, ingredients: [{ name: "Tortillas", quantity: "4" }, { name: "Black beans", quantity: "1", unit: "can" }, { name: "Cheddar", quantity: "100", unit: "g" }] },
  { name: "Spinach Omelet", description: "Quick breakfast or lunch.", instructions: "Beat eggs with milk. Wilt spinach in butter, add eggs and cook until set.", mealType: "breakfast", timeMinutes: 15, isFavorite: true, ingredients: [{ name: "Eggs", quantity: "3" }, { name: "Milk", quantity: "2", unit: "tbsp" }, { name: "Spinach", quantity: "50", unit: "g" }, { name: "Butter", quantity: "1", unit: "tbsp" }] },
  { name: "Roast Chicken and Potatoes", description: "Lemony sheet-pan dinner.", instructions: "Toss chicken, potatoes and carrots with oil. Roast until cooked and finish with lemon.", mealType: "dinner", timeMinutes: 50, ingredients: [{ name: "Chicken breast", quantity: "300", unit: "g" }, { name: "Potatoes", quantity: "400", unit: "g" }, { name: "Carrots", quantity: "2" }, { name: "Olive oil", quantity: "2", unit: "tbsp" }, { name: "Lemons", quantity: "1" }] },
  { name: "Tomato Bean Rice", description: "A filling bowl from staples.", instructions: "Cook rice. Simmer tomatoes, beans, onion and garlic together, then serve over rice.", mealType: "lunch", timeMinutes: 35, ingredients: [{ name: "Rice", quantity: "1", unit: "cup" }, { name: "Black beans", quantity: "1", unit: "can" }, { name: "Canned tomatoes", quantity: "1", unit: "can" }, { name: "Onion", quantity: "1" }, { name: "Garlic", quantity: "2", unit: "cloves" }] },
  { name: "Garlic Spinach Pasta", description: "Fast pasta with greens.", instructions: "Cook pasta. Sauté garlic and spinach in oil, then toss with pasta.", mealType: "lunch", timeMinutes: 20, ingredients: [{ name: "Pasta", quantity: "200", unit: "g" }, { name: "Spinach", quantity: "100", unit: "g" }, { name: "Garlic", quantity: "2", unit: "cloves" }, { name: "Olive oil", quantity: "2", unit: "tbsp" }] },
  { name: "Egg and Cheese Toast", description: "A warm breakfast toast.", instructions: "Toast bread. Fry eggs in butter and top with cheddar.", mealType: "breakfast", timeMinutes: 10, ingredients: [{ name: "Bread", quantity: "2", unit: "slices" }, { name: "Eggs", quantity: "2" }, { name: "Cheddar", quantity: "40", unit: "g" }, { name: "Butter", quantity: "1", unit: "tsp" }] },
  { name: "Overnight Oats", description: "Make-ahead oats with yogurt.", instructions: "Mix oats, milk, yogurt and cinnamon. Refrigerate overnight and serve with fruit.", mealType: "breakfast", timeMinutes: 480, ingredients: [{ name: "Oats", quantity: "1/2", unit: "cup" }, { name: "Milk", quantity: "1/2", unit: "cup" }, { name: "Yogurt", quantity: "1/2", unit: "cup" }, { name: "Cinnamon", quantity: "1", unit: "tsp" }, { name: "Banana", quantity: "1" }] },
  { name: "Potato Carrot Soup", description: "Vegetable soup with a creamy finish.", instructions: "Soften onion and garlic in oil. Simmer potatoes and carrots in broth until tender; blend and stir in milk.", mealType: "lunch", timeMinutes: 45, ingredients: [{ name: "Potatoes", quantity: "400", unit: "g" }, { name: "Carrots", quantity: "2" }, { name: "Onion", quantity: "1" }, { name: "Garlic", quantity: "2", unit: "cloves" }, { name: "Milk", quantity: "1/2", unit: "cup" }, { name: "Vegetable broth", quantity: "2", unit: "cups" }] },
];
