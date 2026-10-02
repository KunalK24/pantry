import { normalizeIngredientName } from "@/lib/ingredient-normalization";

export type RecipeForGroceryList = {
  id: string;
  name: string;
  ingredients: Array<{
    name: string;
    quantity: string | null;
    unit: string | null;
  }>;
};

export type PantryItemForGroceryList = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
};

export type GroceryLineCalculation = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  recipeIds: string[];
  pantryItemId?: string;
  calculation: "computed" | "manual" | "unresolved";
  warning?: string;
};

type Rational = {
  numerator: bigint;
  denominator: bigint;
};

type ComputedRequirement = {
  name: string;
  normalizedName: string;
  unit: string;
  normalizedUnit: string;
  quantity: Rational;
  recipeIds: Set<string>;
};

type SortableGroceryLine = GroceryLineCalculation & {
  normalizedName: string;
  normalizedUnit: string;
  sourceOrder: string;
};

const ZERO = BigInt(0);
const ONE = BigInt(1);
const unresolvedQuantityWarning =
  "This amount could not be compared with pantry stock.";

export function normalizeGroceryText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < ZERO ? -left : left;
  let b = right < ZERO ? -right : right;

  while (b !== ZERO) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

function rational(numerator: bigint, denominator: bigint): Rational | null {
  if (denominator === ZERO) {
    return null;
  }

  const divisor = greatestCommonDivisor(numerator, denominator);

  return {
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  };
}

function parseQuantity(value: string | null): Rational | null {
  if (value === null) {
    return null;
  }

  const quantity = value.trim();
  let match = /^(\d+)$/.exec(quantity);

  if (match) {
    return rational(BigInt(match[1]), ONE);
  }

  match = /^(\d+)\.(\d+)$/.exec(quantity);

  if (match) {
    const scale = BigInt(10) ** BigInt(match[2].length);
    return rational(BigInt(match[1]) * scale + BigInt(match[2]), scale);
  }

  match = /^(\d+)\/(\d+)$/.exec(quantity);

  if (match) {
    return rational(BigInt(match[1]), BigInt(match[2]));
  }

  match = /^(\d+)\s+(\d+)\/(\d+)$/.exec(quantity);

  if (match) {
    const denominator = BigInt(match[3]);

    if (denominator === ZERO) {
      return null;
    }

    return rational(
      BigInt(match[1]) * denominator + BigInt(match[2]),
      denominator,
    );
  }

  return null;
}

function add(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  )!;
}

function subtract(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  )!;
}

function compare(left: Rational, right: Rational): number {
  const difference =
    left.numerator * right.denominator - right.numerator * left.denominator;

  if (difference < ZERO) {
    return -1;
  }

  if (difference > ZERO) {
    return 1;
  }

  return 0;
}

function formatQuantity(value: Rational): string {
  const whole = value.numerator / value.denominator;
  const remainder = value.numerator % value.denominator;

  if (remainder === ZERO) {
    return whole.toString();
  }

  if (whole === ZERO) {
    return `${remainder}/${value.denominator}`;
  }

  return `${whole} ${remainder}/${value.denominator}`;
}

function normalizedKey(name: string, unit: string): string {
  return JSON.stringify([name, unit]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function preferredDisplayText(left: string, right: string): string {
  const leftIsAllUppercase = left.length > 1 && left === left.toUpperCase();
  const rightIsAllUppercase = right.length > 1 && right === right.toUpperCase();

  if (leftIsAllUppercase !== rightIsAllUppercase) {
    return leftIsAllUppercase ? right : left;
  }

  return compareText(left, right) <= 0 ? left : right;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function lineId(kind: "computed" | "manual" | "unresolved", parts: unknown[]): string {
  return `${kind}:${JSON.stringify(parts)}`;
}

function stripSortFields(line: SortableGroceryLine): GroceryLineCalculation {
  return {
    id: line.id,
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    recipeIds: line.recipeIds,
    ...(line.pantryItemId ? { pantryItemId: line.pantryItemId } : {}),
    calculation: line.calculation,
    ...(line.warning ? { warning: line.warning } : {}),
  };
}

export function calculateGroceryLines(
  recipes: RecipeForGroceryList[],
  pantryItems: PantryItemForGroceryList[],
  selectedPantryItemIds: ReadonlySet<string>,
): GroceryLineCalculation[] {
  const computedRequirements = new Map<string, ComputedRequirement>();
  const unresolvedLines: SortableGroceryLine[] = [];

  for (const recipe of recipes) {
    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      const name = ingredient.name.trim().replace(/\s+/g, " ");
      const normalizedName = normalizeIngredientName(ingredient.name);
      const unit = ingredient.unit?.trim().replace(/\s+/g, " ") ?? "";
      const normalizedUnit = normalizeGroceryText(ingredient.unit ?? "");
      const parsedQuantity = parseQuantity(ingredient.quantity);

      if (!parsedQuantity) {
        unresolvedLines.push({
          id: lineId("unresolved", [
            recipe.id,
            ingredientIndex,
            normalizedName,
            normalizedUnit,
            ingredient.quantity?.trim() ?? "",
          ]),
          name,
          quantity: ingredient.quantity?.trim() ?? "",
          unit,
          recipeIds: [recipe.id],
          calculation: "unresolved",
          warning: unresolvedQuantityWarning,
          normalizedName,
          normalizedUnit,
          sourceOrder: `${recipe.id}:${ingredientIndex.toString().padStart(8, "0")}`,
        });
        return;
      }

      const key = normalizedKey(normalizedName, normalizedUnit);
      const existing = computedRequirements.get(key);

      if (existing) {
        existing.quantity = add(existing.quantity, parsedQuantity);
        existing.recipeIds.add(recipe.id);
        existing.name = preferredDisplayText(existing.name, name);
        existing.unit = preferredDisplayText(existing.unit, unit);
        return;
      }

      computedRequirements.set(key, {
        name,
        normalizedName,
        unit,
        normalizedUnit,
        quantity: parsedQuantity,
        recipeIds: new Set([recipe.id]),
      });
    });
  }

  const pantryStock = new Map<string, Rational>();

  for (const pantryItem of pantryItems) {
    const quantity = parseQuantity(pantryItem.quantity);

    if (!quantity) {
      continue;
    }

    const key = normalizedKey(
      normalizeIngredientName(pantryItem.name),
      normalizeGroceryText(pantryItem.unit ?? ""),
    );
    const existing = pantryStock.get(key);
    pantryStock.set(key, existing ? add(existing, quantity) : quantity);
  }

  const selectedPantryByKey = new Map<string, PantryItemForGroceryList[]>();

  for (const pantryItem of pantryItems) {
    if (!selectedPantryItemIds.has(pantryItem.id)) {
      continue;
    }

    const key = normalizedKey(
      normalizeIngredientName(pantryItem.name),
      normalizeGroceryText(pantryItem.unit ?? ""),
    );
    const existing = selectedPantryByKey.get(key) ?? [];
    existing.push(pantryItem);
    selectedPantryByKey.set(key, existing);
  }

  const lines: SortableGroceryLine[] = [...unresolvedLines];
  const mergedPantryItemIds = new Set<string>();

  for (const [key, requirement] of computedRequirements) {
    const available = pantryStock.get(key) ?? { numerator: ZERO, denominator: ONE };
    const shortage = subtract(requirement.quantity, available);

    if (compare(shortage, { numerator: ZERO, denominator: ONE }) <= 0) {
      continue;
    }

    const selectedMatches = (selectedPantryByKey.get(key) ?? [])
      .slice()
      .sort((left, right) => compareText(left.id, right.id));
    const pantryItemId = selectedMatches[0]?.id;

    if (pantryItemId) {
      mergedPantryItemIds.add(pantryItemId);
    }

    lines.push({
      id: lineId("computed", [requirement.normalizedName, requirement.normalizedUnit]),
      name: requirement.name,
      quantity: formatQuantity(shortage),
      unit: requirement.unit,
      recipeIds: sortedUnique(requirement.recipeIds),
      ...(pantryItemId ? { pantryItemId } : {}),
      calculation: "computed",
      normalizedName: requirement.normalizedName,
      normalizedUnit: requirement.normalizedUnit,
      sourceOrder: "",
    });
  }

  for (const pantryItem of pantryItems) {
    if (
      !selectedPantryItemIds.has(pantryItem.id) ||
      mergedPantryItemIds.has(pantryItem.id)
    ) {
      continue;
    }

    const name = pantryItem.name.trim().replace(/\s+/g, " ");
    const normalizedName = normalizeIngredientName(pantryItem.name);
    const unit = pantryItem.unit?.trim().replace(/\s+/g, " ") ?? "";
    const normalizedUnit = normalizeGroceryText(pantryItem.unit ?? "");

    lines.push({
      id: lineId("manual", [pantryItem.id]),
      name,
      quantity: "",
      unit,
      recipeIds: [],
      pantryItemId: pantryItem.id,
      calculation: "manual",
      normalizedName,
      normalizedUnit,
      sourceOrder: pantryItem.id,
    });
  }

  const calculationOrder = {
    computed: 0,
    unresolved: 1,
    manual: 2,
  } as const;

  return lines
    .sort((left, right) =>
      compareText(left.normalizedName, right.normalizedName) ||
      compareText(left.normalizedUnit, right.normalizedUnit) ||
      calculationOrder[left.calculation] - calculationOrder[right.calculation] ||
      compareText(left.sourceOrder, right.sourceOrder) ||
      compareText(left.id, right.id),
    )
    .map(stripSortFields);
}
