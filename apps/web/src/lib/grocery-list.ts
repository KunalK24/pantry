import { normalizeGroceryIngredientName } from "@/lib/ingredient-normalization";

export type RecipeForGroceryList = {
  id: string;
  name: string;
  ingredients: Array<{
    name: string;
    quantity: string | null;
    unit: string | null;
    normalizedName?: string;
    brand?: string | null;
    modifiers?: string[];
    packageQuantity?: string | null;
    packageUnit?: string | null;
  }>;
};

export type PantryItemForGroceryList = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  normalizedName?: string;
  brand?: string | null;
  modifiers?: string[];
  packageQuantity?: string | null;
  packageUnit?: string | null;
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
  coverage?: "tentative";
};

export type RecipeAvailability = {
  available: number;
  total: number;
  availableNames: string[];
  tentativeNames?: string[];
};

export type RecipeRecommendation = {
  recipe: RecipeForGroceryList;
  pantryCoveredNames: string[];
  tentativePantryNames?: string[];
  groceryOverlapNames: string[];
  missingNames: string[];
  total: number;
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
  displayFactor: Rational;
  recipeIds: Set<string>;
  tentativePackages: NonNullable<IngredientAmount["package"]>[];
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
const unverifiedPackageWarning =
  "Pantry package size is unknown; confirm this amount before shopping.";

type IngredientAmount = {
  quantity: Rational;
  normalizedUnit: string;
  displayUnit: string;
  displayFactor: Rational;
  package?: {
    count: Rational;
    unit: string;
    size: Rational;
    dimension: string;
  };
};

type GroceryIngredient = RecipeForGroceryList["ingredients"][number];
type StockIngredient = PantryItemForGroceryList;

const packageUnits = new Map([
  ["bags", "bag"], ["bag", "bag"],
  ["bottles", "bottle"], ["bottle", "bottle"],
  ["boxes", "box"], ["box", "box"],
  ["cans", "can"], ["can", "can"],
  ["cartons", "carton"], ["carton", "carton"],
  ["jars", "jar"], ["jar", "jar"],
  ["packages", "package"], ["package", "package"],
  ["packets", "packet"], ["packet", "packet"],
  ["pouches", "pouch"], ["pouch", "pouch"],
  ["tins", "tin"], ["tin", "tin"],
]);

const countUnits = new Map([
  ["bunches", "bunch"], ["bunch", "bunch"],
  ["cloves", "clove"], ["clove", "clove"],
  ["pieces", "piece"], ["piece", "piece"],
  ["slices", "slice"], ["slice", "slice"],
]);

// Conversion factors are exact decimal definitions in grams or milliliters.
const measurementUnits = new Map<string, { dimension: string; factor: string }>([
  ["g", { dimension: "g", factor: "1" }],
  ["gram", { dimension: "g", factor: "1" }],
  ["grams", { dimension: "g", factor: "1" }],
  ["kg", { dimension: "g", factor: "1000" }],
  ["kilogram", { dimension: "g", factor: "1000" }],
  ["kilograms", { dimension: "g", factor: "1000" }],
  ["oz", { dimension: "g", factor: "28.349523125" }],
  ["ounce", { dimension: "g", factor: "28.349523125" }],
  ["ounces", { dimension: "g", factor: "28.349523125" }],
  ["lb", { dimension: "g", factor: "453.59237" }],
  ["lbs", { dimension: "g", factor: "453.59237" }],
  ["pound", { dimension: "g", factor: "453.59237" }],
  ["pounds", { dimension: "g", factor: "453.59237" }],
  ["ml", { dimension: "ml", factor: "1" }],
  ["milliliter", { dimension: "ml", factor: "1" }],
  ["milliliters", { dimension: "ml", factor: "1" }],
  ["l", { dimension: "ml", factor: "1000" }],
  ["liter", { dimension: "ml", factor: "1000" }],
  ["liters", { dimension: "ml", factor: "1000" }],
  ["fl oz", { dimension: "ml", factor: "29.5735295625" }],
  ["fluid ounce", { dimension: "ml", factor: "29.5735295625" }],
  ["fluid ounces", { dimension: "ml", factor: "29.5735295625" }],
  ["cup", { dimension: "ml", factor: "236.5882365" }],
  ["cups", { dimension: "ml", factor: "236.5882365" }],
  ["tbsp", { dimension: "ml", factor: "14.78676478125" }],
  ["tablespoon", { dimension: "ml", factor: "14.78676478125" }],
  ["tablespoons", { dimension: "ml", factor: "14.78676478125" }],
  ["tsp", { dimension: "ml", factor: "4.92892159375" }],
  ["teaspoon", { dimension: "ml", factor: "4.92892159375" }],
  ["teaspoons", { dimension: "ml", factor: "4.92892159375" }],
]);

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

function multiply(value: Rational, multiplier: number): Rational {
  return rational(value.numerator * BigInt(multiplier), value.denominator)!;
}

function multiplyRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  )!;
}

function divide(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  )!;
}

function normalizeUnit(unit: string | null): string {
  const normalized = normalizeGroceryText(unit ?? "").replace(/\.$/u, "");
  return packageUnits.get(normalized) ?? countUnits.get(normalized) ?? normalized;
}

function ingredientName(
  ingredient: GroceryIngredient | StockIngredient,
): { normalizedName: string; displayName: string } {
  if (ingredient.normalizedName) {
    return {
      normalizedName: ingredient.normalizedName,
      displayName: ingredient.name.trim(),
    };
  }

  return normalizeGroceryIngredientName(ingredient.name, ingredient.unit);
}

function ingredientAmount(
  ingredient: GroceryIngredient | StockIngredient,
): IngredientAmount | null {
  const count = parseQuantity(ingredient.quantity);
  if (!count) {
    return null;
  }

  const unit = normalizeUnit(ingredient.unit);
  const measurement = measurementUnits.get(unit);
  if (measurement) {
    const factor = parseQuantity(measurement.factor)!;
    return {
      quantity: multiplyRational(count, factor),
      normalizedUnit: measurement.dimension,
      displayUnit: ingredient.unit?.trim() ?? "",
      displayFactor: factor,
    };
  }

  const packageUnit = packageUnits.get(unit);
  const packageSize = parseQuantity(ingredient.packageQuantity ?? null);
  const packageMeasurement = measurementUnits.get(
    normalizeUnit(ingredient.packageUnit ?? null),
  );

  if (packageUnit && packageSize && packageMeasurement) {
    const factor = parseQuantity(packageMeasurement.factor)!;
    const size = multiplyRational(packageSize, factor);
    return {
      quantity: multiplyRational(count, size),
      normalizedUnit: packageMeasurement.dimension,
      displayUnit: ingredient.packageUnit?.trim() ?? "",
      displayFactor: factor,
      package: {
        count,
        unit: packageUnit,
        size,
        dimension: packageMeasurement.dimension,
      },
    };
  }

  return {
    quantity: count,
    normalizedUnit: unit,
    displayUnit: ingredient.unit?.trim() ?? "",
    displayFactor: { numerator: ONE, denominator: ONE },
  };
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
  if (value.denominator > BigInt(1000)) {
    const scaled = value.numerator * BigInt(100);
    const rounded =
      (scaled + value.denominator - ONE) / value.denominator;
    const whole = rounded / BigInt(100);
    const fractional = (rounded % BigInt(100)).toString().padStart(2, "0");
    return fractional === "00" ? whole.toString() : `${whole}.${fractional}`;
  }

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

function lineId(
  kind: "computed" | "manual" | "unresolved",
  parts: unknown[],
): string {
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
    ...(line.coverage ? { coverage: line.coverage } : {}),
  };
}

type PantryStock = {
  quantities: Map<string, Rational>;
  packageCounts: Map<string, Rational>;
  unknownPackageCounts: Map<string, Rational>;
};

function addStock(
  stock: Map<string, Rational>,
  key: string,
  quantity: Rational,
) {
  const existing = stock.get(key);
  stock.set(key, existing ? add(existing, quantity) : quantity);
}

function buildPantryStock(pantryItems: PantryItemForGroceryList[]) {
  const pantryStock: PantryStock = {
    quantities: new Map(),
    packageCounts: new Map(),
    unknownPackageCounts: new Map(),
  };

  for (const pantryItem of pantryItems) {
    const amount = ingredientAmount(pantryItem);
    if (!amount) {
      continue;
    }

    const name = ingredientName(pantryItem).normalizedName;
    const quantityKey = normalizedKey(name, amount.normalizedUnit);
    addStock(pantryStock.quantities, quantityKey, amount.quantity);

    const packageUnit = packageUnits.get(normalizeUnit(pantryItem.unit));
    if (packageUnit) {
      const packageKey = normalizedKey(name, packageUnit);
      const count = amount.package?.count ?? amount.quantity;
      addStock(pantryStock.packageCounts, packageKey, count);
      if (!amount.package) {
        addStock(pantryStock.unknownPackageCounts, packageKey, count);
      }
    }
  }

  return pantryStock;
}

type RecipeRequirement = {
  displayName: string;
  quantities: Map<string, Rational>;
  tentativePackages: NonNullable<IngredientAmount["package"]>[];
  unresolved: boolean;
};

function recipeRequirementsByName(recipe: RecipeForGroceryList) {
  const requirements = new Map<string, RecipeRequirement>();

  for (const ingredient of recipe.ingredients) {
    const { normalizedName, displayName } = ingredientName(ingredient);
    const amount = ingredientAmount(ingredient);
    const current = requirements.get(normalizedName) ?? {
      displayName,
      quantities: new Map<string, Rational>(),
      tentativePackages: [],
      unresolved: false,
    };

    current.displayName = preferredDisplayText(
      current.displayName,
      displayName,
    );

    if (!amount) {
      current.unresolved = true;
    } else {
      const existing = current.quantities.get(amount.normalizedUnit);
      current.quantities.set(
        amount.normalizedUnit,
        existing ? add(existing, amount.quantity) : amount.quantity,
      );
      if (amount.package) {
        current.tentativePackages.push(amount.package);
      }
    }

    requirements.set(normalizedName, current);
  }

  return requirements;
}

function stockForRequirement(
  stock: PantryStock,
  name: string,
  unit: string,
  hasPhysicalDemand: boolean,
): Rational | undefined {
  const key = normalizedKey(name, unit);
  if (!hasPhysicalDemand && packageUnits.has(unit)) {
    return stock.packageCounts.get(key);
  }
  if (hasPhysicalDemand && packageUnits.has(unit)) {
    // Known packages may already have been counted toward the physical demand.
    return stock.unknownPackageCounts.get(key);
  }
  return stock.quantities.get(key);
}

function requirementCoverage(
  name: string,
  requirement: RecipeRequirement,
  stock: PantryStock,
): "exact" | "tentative" | "missing" {
  if (requirement.unresolved) {
    return "missing";
  }

  const hasPhysicalDemand = [...requirement.quantities.keys()].some(
    (unit) => unit === "g" || unit === "ml",
  );
  const deficits = [...requirement.quantities].flatMap(([unit, quantity]) => {
    const available = stockForRequirement(stock, name, unit, hasPhysicalDemand);
    const missing = subtract(quantity, available ?? { numerator: ZERO, denominator: ONE });
    return compare(missing, { numerator: ZERO, denominator: ONE }) > 0
      ? [{ unit, missing }]
      : [];
  });

  if (deficits.length === 0) {
    return "exact";
  }

  // Unknown package sizes only help when the recipe itself specifies a package.
  // Do not infer a size for an arbitrary mass or volume requirement.
  if (
    deficits.length !== 1 ||
    requirement.tentativePackages.length === 0 ||
    requirement.quantities.size !== 1
  ) {
    return "missing";
  }

  const [{ unit, missing }] = deficits;
  if (unit !== "g" && unit !== "ml") {
    return "missing";
  }

  const candidates = requirement.tentativePackages.filter(
    (candidate) => candidate.dimension === unit,
  );
  const reference = candidates[0];
  if (
    !reference ||
    candidates.length !== requirement.tentativePackages.length ||
    candidates.some(
      (candidate) =>
        candidate.unit !== reference.unit ||
        compare(candidate.size, reference.size) !== 0,
    )
  ) {
    return "missing";
  }

  const packageMass = candidates.reduce(
    (total, candidate) => add(total, multiplyRational(candidate.count, candidate.size)),
    { numerator: ZERO, denominator: ONE },
  );
  const requiredAmount = requirement.quantities.get(unit);
  if (!requiredAmount || compare(packageMass, requiredAmount) !== 0) {
    return "missing";
  }

  const available = stock.unknownPackageCounts.get(
    normalizedKey(name, reference.unit),
  );
  const needed = divide(missing, reference.size);
  return available !== undefined && compare(available, needed) >= 0
    ? "tentative"
    : "missing";
}

export function calculateRecipeAvailability(
  recipe: RecipeForGroceryList,
  pantryItems: PantryItemForGroceryList[],
): RecipeAvailability {
  const pantryStock = buildPantryStock(pantryItems);
  const requirements = recipeRequirementsByName(recipe);
  const availableNames: string[] = [];
  const tentativeNames: string[] = [];

  for (const [normalizedName, requirement] of requirements) {
    const coverage = requirementCoverage(
      normalizedName,
      requirement,
      pantryStock,
    );

    if (coverage !== "missing") {
      availableNames.push(requirement.displayName);
      if (coverage === "tentative") {
        tentativeNames.push(requirement.displayName);
      }
    }
  }

  return {
    available: availableNames.length,
    total: requirements.size,
    availableNames: availableNames.sort((left, right) =>
      compareText(
        normalizeGroceryIngredientName(left).normalizedName,
        normalizeGroceryIngredientName(right).normalizedName,
      ),
    ),
    ...(tentativeNames.length > 0
      ? { tentativeNames: tentativeNames.sort(compareText) }
      : {}),
  };
}

export function calculateRecipeRecommendations(
  recipes: RecipeForGroceryList[],
  pantryItems: PantryItemForGroceryList[],
  visibleGroceryLines: GroceryLineCalculation[],
  selectedRecipeIds: ReadonlySet<string>,
): RecipeRecommendation[] {
  const groceryNames = new Set(
    visibleGroceryLines.map(
      (line) =>
        normalizeGroceryIngredientName(line.name, line.unit).normalizedName,
    ),
  );

  return recipes
    .filter((recipe) => !selectedRecipeIds.has(recipe.id))
    .map((recipe) => {
      const requirements = recipeRequirementsByName(recipe);
      const pantryStock = buildPantryStock(pantryItems);
      const pantryCoveredNames: string[] = [];
      const tentativePantryNames: string[] = [];
      const groceryOverlapNames: string[] = [];
      const missingNames: string[] = [];

      for (const [normalizedName, requirement] of requirements) {
        const coverage = requirementCoverage(
          normalizedName,
          requirement,
          pantryStock,
        );
        if (coverage !== "missing") {
          pantryCoveredNames.push(requirement.displayName);
          if (coverage === "tentative") {
            tentativePantryNames.push(requirement.displayName);
          }
        } else if (groceryNames.has(normalizedName)) {
          groceryOverlapNames.push(requirement.displayName);
        } else {
          missingNames.push(requirement.displayName);
        }
      }

      const sortNames = (names: string[]) =>
        names.sort((left, right) =>
          compareText(
            normalizeGroceryIngredientName(left).normalizedName,
            normalizeGroceryIngredientName(right).normalizedName,
          ),
        );

      return {
        recipe,
        pantryCoveredNames: sortNames(pantryCoveredNames),
        ...(tentativePantryNames.length > 0
          ? { tentativePantryNames: sortNames(tentativePantryNames) }
          : {}),
        groceryOverlapNames: sortNames(groceryOverlapNames),
        missingNames: sortNames(missingNames),
        total: requirements.size,
      };
    })
    .filter(
      (recommendation) =>
        recommendation.pantryCoveredNames.length +
          recommendation.groceryOverlapNames.length >
        0,
    )
    .sort((left, right) => {
      const leftCovered =
        left.pantryCoveredNames.length + left.groceryOverlapNames.length;
      const rightCovered =
        right.pantryCoveredNames.length + right.groceryOverlapNames.length;

      return (
        left.missingNames.length - right.missingNames.length ||
        rightCovered * left.total - leftCovered * right.total ||
        right.groceryOverlapNames.length - left.groceryOverlapNames.length ||
        right.pantryCoveredNames.length - left.pantryCoveredNames.length ||
        compareText(
          left.recipe.name.toLowerCase(),
          right.recipe.name.toLowerCase(),
        ) ||
        compareText(left.recipe.id, right.recipe.id)
      );
    });
}

export function calculateGroceryLines(
  recipes: RecipeForGroceryList[],
  pantryItems: PantryItemForGroceryList[],
  selectedPantryItemIds: ReadonlySet<string>,
  recipeMultipliers?: ReadonlyMap<string, number>,
): GroceryLineCalculation[] {
  const computedRequirements = new Map<string, ComputedRequirement>();
  const unresolvedLines: SortableGroceryLine[] = [];

  for (const recipe of recipes) {
    const requestedMultiplier = recipeMultipliers?.get(recipe.id) ?? 1;
    const multiplier =
      Number.isSafeInteger(requestedMultiplier) && requestedMultiplier > 0
        ? requestedMultiplier
        : 1;

    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      const { normalizedName, displayName: name } = ingredientName(ingredient);
      const amount = ingredientAmount(ingredient);
      const unit = amount?.displayUnit ?? ingredient.unit?.trim() ?? "";
      const normalizedUnit = amount?.normalizedUnit ?? normalizeUnit(ingredient.unit);

      if (!amount) {
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
          warning:
            multiplier > 1
              ? `${multiplier} preparations require manual quantity verification.`
              : unresolvedQuantityWarning,
          normalizedName,
          normalizedUnit,
          sourceOrder: `${recipe.id}:${ingredientIndex.toString().padStart(8, "0")}`,
        });
        return;
      }

      const key = normalizedKey(normalizedName, normalizedUnit);
      const existing = computedRequirements.get(key);

      if (existing) {
        existing.quantity = add(
          existing.quantity,
          multiply(amount.quantity, multiplier),
        );
        existing.recipeIds.add(recipe.id);
        existing.name = preferredDisplayText(existing.name, name);
        if (
          compare(amount.displayFactor, existing.displayFactor) < 0 ||
          (compare(amount.displayFactor, existing.displayFactor) === 0 &&
            compareText(unit, existing.unit) < 0)
        ) {
          existing.unit = unit;
          existing.displayFactor = amount.displayFactor;
        }
        if (amount.package) {
          existing.tentativePackages.push({
            ...amount.package,
            count: multiply(amount.package.count, multiplier),
          });
        }
        return;
      }

      computedRequirements.set(key, {
        name,
        normalizedName,
        unit,
        normalizedUnit,
        quantity: multiply(amount.quantity, multiplier),
        displayFactor: amount.displayFactor,
        recipeIds: new Set([recipe.id]),
        tentativePackages: amount.package
          ? [{ ...amount.package, count: multiply(amount.package.count, multiplier) }]
          : [],
      });
    });
  }

  const pantryStock = buildPantryStock(pantryItems);
  const physicalDemandNames = new Set(
    [...computedRequirements.values()]
      .filter((requirement) =>
        requirement.normalizedUnit === "g" || requirement.normalizedUnit === "ml",
      )
      .map((requirement) => requirement.normalizedName),
  );

  const selectedPantryByKey = new Map<string, PantryItemForGroceryList[]>();

  for (const pantryItem of pantryItems) {
    if (!selectedPantryItemIds.has(pantryItem.id)) {
      continue;
    }

    const amount = ingredientAmount(pantryItem);
    const key = normalizedKey(
      ingredientName(pantryItem).normalizedName,
      amount?.normalizedUnit ?? normalizeUnit(pantryItem.unit),
    );
    const existing = selectedPantryByKey.get(key) ?? [];
    existing.push(pantryItem);
    selectedPantryByKey.set(key, existing);
  }

  const lines: SortableGroceryLine[] = [...unresolvedLines];
  const mergedPantryItemIds = new Set<string>();

  for (const [key, requirement] of computedRequirements) {
    const amountRequirement: RecipeRequirement = {
      displayName: requirement.name,
      quantities: new Map([[requirement.normalizedUnit, requirement.quantity]]),
      tentativePackages: requirement.tentativePackages,
      unresolved: false,
    };
    const coverage = requirementCoverage(
      requirement.normalizedName,
      amountRequirement,
      pantryStock,
    );
    if (coverage === "tentative") {
      const referencePackage = requirement.tentativePackages[0];
      const packageUnit = referencePackage.unit;
      const knownAmount = pantryStock.quantities.get(key) ?? {
        numerator: ZERO,
        denominator: ONE,
      };
      const uncoveredCount = divide(
        subtract(requirement.quantity, knownAmount),
        referencePackage.size,
      );
      const selectedPackage = pantryItems
        .filter(
          (item) =>
            selectedPantryItemIds.has(item.id) &&
            ingredientName(item).normalizedName === requirement.normalizedName &&
            normalizeUnit(item.unit) === packageUnit &&
            !ingredientAmount(item)?.package,
        )
        .sort((left, right) => compareText(left.id, right.id))[0];
      if (selectedPackage) {
        mergedPantryItemIds.add(selectedPackage.id);
      }
      lines.push({
        id: lineId("unresolved", [
          requirement.normalizedName,
          requirement.normalizedUnit,
          "tentative",
        ]),
        name: requirement.name,
        quantity: formatQuantity(uncoveredCount),
        unit: packageUnit,
        recipeIds: sortedUnique(requirement.recipeIds),
        ...(selectedPackage ? { pantryItemId: selectedPackage.id } : {}),
        calculation: "unresolved",
        warning: unverifiedPackageWarning,
        coverage: "tentative",
        normalizedName: requirement.normalizedName,
        normalizedUnit: requirement.normalizedUnit,
        sourceOrder: "",
      });
      continue;
    }

    const available = stockForRequirement(
      pantryStock,
      requirement.normalizedName,
      requirement.normalizedUnit,
      physicalDemandNames.has(requirement.normalizedName),
    ) ?? { numerator: ZERO, denominator: ONE };
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
      id: lineId("computed", [
        requirement.normalizedName,
        requirement.normalizedUnit,
      ]),
      name: requirement.name,
      quantity: formatQuantity(divide(shortage, requirement.displayFactor)),
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
    const normalizedName = ingredientName(pantryItem).normalizedName;
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
    .sort(
      (left, right) =>
        compareText(left.normalizedName, right.normalizedName) ||
        compareText(left.normalizedUnit, right.normalizedUnit) ||
        calculationOrder[left.calculation] -
          calculationOrder[right.calculation] ||
        compareText(left.sourceOrder, right.sourceOrder) ||
        compareText(left.id, right.id),
    )
    .map(stripSortFields);
}
