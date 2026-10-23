const ingredientAliases: ReadonlyMap<string, string> = new Map([
  ["scallion", "green onion"],
  ["scallions", "green onion"],
  ["green onions", "green onion"],
]);

const prepActions = new Set([
  "chopped",
  "crushed",
  "cubed",
  "diced",
  "drained",
  "grated",
  "halved",
  "minced",
  "peeled",
  "pitted",
  "quartered",
  "rinsed",
  "seeded",
  "shredded",
  "sliced",
  "torn",
  "trimmed",
]);

const prepModifiers = new Set([
  "and",
  "cold",
  "coarsely",
  "finely",
  "freshly",
  "large",
  "roughly",
  "small",
  "thinly",
]);

const leadingPrepPhrases = [/^freshly cracked\s+/iu, /^freshly grated\s+/iu];

const cutIntoPrepPattern =
  /^cut into .+\b(cubes?|dice|pieces?|slices?|rounds?)$/iu;
const displayCountUnits = new Set(["clove", "cloves"]);

export function normalizeIngredientName(name: string): string {
  const normalizedName = name.trim().replace(/\s+/gu, " ").toLowerCase();

  return ingredientAliases.get(normalizedName) ?? normalizedName;
}

export type NormalizedGroceryIngredientName = {
  normalizedName: string;
  displayName: string;
};

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function isPrepInstructionSuffix(value: string): boolean {
  const normalizedSuffix = normalizeWhitespace(value).toLowerCase();

  if (cutIntoPrepPattern.test(normalizedSuffix.replace(/[()]/gu, ""))) {
    return true;
  }

  const words = normalizedSuffix.split(" ");

  return (
    words.some((word) => prepActions.has(word)) &&
    words.every((word) => prepActions.has(word) || prepModifiers.has(word))
  );
}

function stripPrepDescriptors(name: string): {
  name: string;
  changed: boolean;
} {
  let strippedName = normalizeWhitespace(name);
  let changed = strippedName !== name;

  for (const phrase of leadingPrepPhrases) {
    if (phrase.test(strippedName)) {
      strippedName = normalizeWhitespace(strippedName.replace(phrase, ""));
      changed = true;
      break;
    }
  }

  const parts = strippedName.split(",").map(normalizeWhitespace);
  const [baseName, ...suffixes] = parts;

  if (
    baseName &&
    suffixes.length > 0 &&
    suffixes.every(isPrepInstructionSuffix)
  ) {
    return { name: baseName, changed: true };
  }

  return { name: strippedName, changed };
}

function stripDisplayCountUnit(
  name: string,
  unit: string,
): { name: string; changed: boolean } {
  if (!displayCountUnits.has(unit)) {
    return { name, changed: false };
  }

  const words = normalizeWhitespace(name).split(" ");
  const lastWord = words.at(-1)?.toLowerCase();

  if (!lastWord || !displayCountUnits.has(lastWord) || words.length === 1) {
    return { name, changed: false };
  }

  return { name: words.slice(0, -1).join(" "), changed: true };
}

export function normalizeGroceryIngredientName(
  name: string,
  unit?: string | null,
): NormalizedGroceryIngredientName {
  const originalDisplayName = normalizeWhitespace(name);
  const prepStripped = stripPrepDescriptors(originalDisplayName);
  const normalizedUnit = normalizeWhitespace(unit ?? "").toLowerCase();
  const countStripped = stripDisplayCountUnit(
    prepStripped.name,
    normalizedUnit,
  );
  const normalizedName = normalizeIngredientName(countStripped.name);
  const shouldAppendUnit =
    displayCountUnits.has(normalizedUnit) &&
    !displayCountUnits.has(normalizedName.split(" ").at(-1) ?? "");

  let displayName =
    prepStripped.changed || countStripped.changed
      ? normalizedName
      : originalDisplayName;

  if (shouldAppendUnit) {
    displayName = `${normalizedName} ${normalizedUnit}`;
  }

  return {
    normalizedName,
    displayName,
  };
}
