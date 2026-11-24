import { extractMeasurements, parseIngredient } from "parse-ingredient";

const ingredientAliases: ReadonlyMap<string, string> = new Map([
  ["scallion", "green onion"],
  ["scallions", "green onion"],
  ["green onions", "green onion"],
  ["chickpeas", "chickpea"],
  ["garbanzo bean", "chickpea"],
  ["garbanzo beans", "chickpea"],
]);

export function titleCaseIngredientName(name: string): string {
  return name.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, prefix: string, letter: string) =>
    `${prefix}${letter.toUpperCase()}`,
  );
}

const prepActions = new Set([
  "chopped",
  "crushed",
  "cracked",
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
  "undrained",
  "julienned",
  "mashed",
  "zested",
  "crumbled",
  "shaved",
  "chiffonaded",
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
  "very",
]);

const purposeQualifier = /\s*\(\s*for\s+[^()]+\)\s*$/iu;

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

const PACKAGE_NOUNS =
  /^(?:can|bag|jar|bottle|carton|box|packet|package|tin|tub|pouch|container)s?$/iu;
const PACKAGE_NOUN_AT_START =
  /^(?:can|bag|jar|bottle|carton|box|packet|package|tin|tub|pouch|container)s?\b\s*(?:of\s+)?/iu;
const BRAND_PREFIXES = [
  "trader joe's",
  "whole foods",
  "365 by whole foods",
  "great value",
  "kirkland signature",
  "simple truth",
  "good & gather",
  "aldi's",
  "aldi",
  "kroger's",
  "kroger",
  "safeway",
  "publix",
  "wegmans",
  "target",
  "walmart",
  "costco",
];

const PACKAGE_UNITS: ReadonlyMap<string, string> = new Map([
  ["ounce", "oz"],
  ["oz", "oz"],
  ["gram", "g"],
  ["g", "g"],
  ["pound", "lb"],
  ["lb", "lb"],
  ["kilogram", "kg"],
  ["kg", "kg"],
  ["fluid ounce", "fl oz"],
  ["fl oz", "fl oz"],
  ["milliliter", "ml"],
  ["ml", "ml"],
  ["liter", "l"],
  ["l", "l"],
]);

export type IngredientDetailsInput = {
  quantity?: string | null;
  unit?: string | null;
  brand?: string | null;
  modifiers?: string[];
  packageQuantity?: string | null;
  packageUnit?: string | null;
};

export type ParsedIngredientDetails = {
  normalizedName: string;
  quantity: string | null;
  unit: string | null;
  brand: string | null;
  modifiers: string[];
  packageQuantity: string | null;
  packageUnit: string | null;
};

export function normalizePackageUnit(unit: string): string | null {
  const normalized = normalizeWhitespace(unit).toLowerCase().replace(/\.$/u, "");
  const singular = normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
  return PACKAGE_UNITS.get(normalized) ?? PACKAGE_UNITS.get(singular) ?? null;
}

function extractBrand(
  name: string,
  correction?: string | null,
): { name: string; brand: string | null } {
  if (correction) {
    const normalizedBrand = normalizeWhitespace(correction);
    const marked = name.match(/^brand\s*:\s*([^,;]+)[,;]\s*(.+)$/iu);
    if (marked && normalizeWhitespace(marked[1]).toLowerCase() === normalizedBrand.toLowerCase()) {
      return { name: marked[2], brand: normalizedBrand };
    }
    const prefix = name.slice(0, normalizedBrand.length);
    if (
      prefix.toLowerCase() === normalizedBrand.toLowerCase() &&
      /^[\s,'’]/u.test(name.slice(normalizedBrand.length))
    ) {
      return {
        name: name.slice(normalizedBrand.length).replace(/^(?:['’]s)?[\s,]+/iu, ""),
        brand: normalizedBrand,
      };
    }
    return { name, brand: normalizedBrand };
  }

  const explicit = name.match(/^brand\s*:\s*([^,;]+)[,;]\s*(.+)$/iu);
  if (explicit) {
    return { name: explicit[2], brand: normalizeWhitespace(explicit[1]) };
  }

  const lowerName = name.toLowerCase();
  const knownBrand = BRAND_PREFIXES.find(
    (brand) => lowerName.startsWith(`${brand} `) || lowerName.startsWith(`${brand},`),
  );
  if (knownBrand) {
    return {
      name: name.slice(knownBrand.length).replace(/^[\s,]+/u, ""),
      brand: name.slice(0, knownBrand.length),
    };
  }

  const byBrand = name.match(/^(.+?),\s*by\s+([^,]+)$/iu);
  if (byBrand) {
    return { name: byBrand[1], brand: normalizeWhitespace(byBrand[2]) };
  }

  return { name, brand: null };
}

function extractPreparation(
  name: string,
  preserveLeadingProductForm = false,
): { name: string; modifiers: string[] } {
  let remaining = name;
  const modifiers: string[] = [];

  const parenthetical = remaining.match(/^(.+?)\s*\(([^()]*)\)\s*$/u);
  if (parenthetical && isPrepInstructionSuffix(parenthetical[2])) {
    remaining = normalizeWhitespace(parenthetical[1]);
    modifiers.push(normalizeWhitespace(parenthetical[2]));
  }

  const commaParts = remaining.split(",").map(normalizeWhitespace);
  if (commaParts.length > 1 && commaParts.slice(1).every(isPrepInstructionSuffix)) {
    remaining = commaParts[0];
    modifiers.push(...commaParts.slice(1));
  }

  const words = remaining.split(" ");
  const actionIndex = words.findIndex((word) => prepActions.has(word.toLowerCase()));
  if (!preserveLeadingProductForm && (actionIndex === 0 || (actionIndex > 0 && words.slice(0, actionIndex).every((word) => prepModifiers.has(word.toLowerCase()))))) {
    const nextWords = words.slice(actionIndex + 1);
    if (nextWords.length > 0) {
      modifiers.unshift(words.slice(0, actionIndex + 1).join(" "));
      remaining = nextWords.join(" ");
    }
  }

  return { name: remaining, modifiers };
}

function extractPackage(name: string, providedUnit: string | null): {
  name: string;
  unit: string | null;
  packageQuantity: string | null;
  packageUnit: string | null;
} {
  const compactPackage = name.match(/^(\d+(?:\.\d+)?)(oz|g|kg|lb|ml|l)\s*((?:can|bag|jar|bottle|carton|box|packet|package|tin|tub|pouch|container)s?)\b\s*(.+)$/iu);
  if (compactPackage) {
    return {
      name: normalizeWhitespace(compactPackage[4]),
      unit: providedUnit ?? compactPackage[3].replace(/s$/iu, "").toLowerCase(),
      packageQuantity: compactPackage[1],
      packageUnit: normalizePackageUnit(compactPackage[2]),
    };
  }

  const measurements = extractMeasurements(name);

  for (const measurement of measurements) {
    if (measurement.quantity2 !== null || measurement.unitType !== "mass" && measurement.unitType !== "volume") {
      continue;
    }
    const packageUnit = normalizePackageUnit(measurement.unitOfMeasureID ?? "");
    if (!packageUnit) {
      continue;
    }

    const before = name.slice(0, measurement.startIndex);
    const after = name.slice(measurement.endIndex);
    const packageAfter = after.match(/^\s*[-\s]?\s*((?:can|bag|jar|bottle|carton|box|packet|package|tin|tub|pouch|container)s?)\b/iu);
    if (packageAfter) {
      const remaining = normalizeWhitespace(`${before} ${after.slice(packageAfter[0].length)}`.replace(/^[\s,(×x*]+|[\s,)]+$/giu, "").replace(/^of\s+/iu, ""));
      return {
        name: remaining,
        unit: providedUnit ?? packageAfter[1].replace(/s$/iu, "").toLowerCase(),
        packageQuantity: String(measurement.quantity),
        packageUnit,
      };
    }

    const packageBefore = before.match(/\b((?:can|bag|jar|bottle|carton|box|packet|package|tin|tub|pouch|container)s?)\s*\(?\s*$/iu);
    if (packageBefore) {
      const remaining = normalizeWhitespace(`${before.slice(0, packageBefore.index)} ${after.replace(/^\s*\)\s*/u, "")}`.replace(/^of\s+/iu, ""));
      return {
        name: remaining,
        unit: providedUnit ?? packageBefore[1].replace(/s$/iu, "").toLowerCase(),
        packageQuantity: String(measurement.quantity),
        packageUnit,
      };
    }

    if (providedUnit && PACKAGE_NOUNS.test(providedUnit) && /^\s*\(?\s*$/u.test(before)) {
      return {
        name: normalizeWhitespace(after.replace(/^\s*\)\s*/u, "")),
        unit: providedUnit,
        packageQuantity: String(measurement.quantity),
        packageUnit,
      };
    }
  }

  const barePackage = name.match(PACKAGE_NOUN_AT_START);
  if (barePackage) {
    return {
      name: normalizeWhitespace(name.slice(barePackage[0].length)),
      unit: providedUnit ?? barePackage[0].trim().split(" ")[0].replace(/s$/iu, "").toLowerCase(),
      packageQuantity: null,
      packageUnit: null,
    };
  }

  return { name, unit: providedUnit, packageQuantity: null, packageUnit: null };
}

export function parseIngredientDetails(
  name: string,
  input: IngredientDetailsInput = {},
): ParsedIngredientDetails {
  const originalName = normalizeWhitespace(name).replace(purposeQualifier, "").trim();
  const hasAmountInFields =
    (input.quantity != null && !/^(?:\d+(?:\.\d+)?|\d+\/\d+|\d+\s+\d+\/\d+|\d+\s*[-–]\s*\d+|to taste|as needed)$/iu.test(input.quantity.trim())) ||
    /\d/u.test(input.unit ?? "");
  if (hasAmountInFields) {
    const combined = normalizeWhitespace(`${input.quantity ?? ""} ${input.unit ?? ""} ${originalName}`);
    const combinedParsed = parseIngredient(combined, { normalizeUOM: true })[0];
    if (combinedParsed?.quantity != null) {
      const combinedPackage = extractPackage(
        combinedParsed.description,
        combinedParsed.unitOfMeasureID ?? null,
      );
      const branded = extractBrand(combinedPackage.name, input.brand);
      const prepared = extractPreparation(branded.name, PACKAGE_NOUNS.test(combinedPackage.unit ?? ""));
      return {
        normalizedName: normalizeIngredientName(prepared.name),
        quantity: String(combinedParsed.quantity),
        unit: combinedPackage.unit,
        brand: input.brand !== undefined ? input.brand : branded.brand,
        modifiers: input.modifiers ?? prepared.modifiers,
        packageQuantity: input.packageQuantity !== undefined ? input.packageQuantity : combinedPackage.packageQuantity,
        packageUnit: input.packageUnit !== undefined ? input.packageUnit : combinedPackage.packageUnit,
      };
    }
  }

  const parsed = parseIngredient(originalName, { normalizeUOM: true })[0];
  const hasLeadingAmount = /^\d+(?:[./]\d+)?(?:\s+\d+\/\d+)?\s+/u.test(originalName);
  const hasCompactMeasuredAmount =
    /^\d+(?:\.\d+)?(?:kg|g|oz|lb|ml|l)\s+\S/iu.test(originalName) &&
    parsed?.unitOfMeasureID != null &&
    !PACKAGE_NOUN_AT_START.test(parsed.description);
  const hasAmountInName = hasLeadingAmount || hasCompactMeasuredAmount;
  const canInferAmount =
    input.quantity == null &&
    parsed?.quantity != null &&
    hasAmountInName;
  const hasMatchingAmount =
    input.quantity != null &&
    parsed?.quantity != null &&
    hasAmountInName &&
    Number(input.quantity) === parsed.quantity;
  const quantity = input.quantity ?? (canInferAmount ? String(parsed?.quantity) : null);
  const sourceName = canInferAmount || hasMatchingAmount ? (parsed?.description ?? originalName) : originalName;
  const inferredUnit = input.unit ?? (canInferAmount || hasMatchingAmount ? parsed?.unitOfMeasureID ?? null : null);
  const packageDetails = extractPackage(sourceName, inferredUnit);
  const branded = extractBrand(packageDetails.name, input.brand);
  const prepared = extractPreparation(branded.name, PACKAGE_NOUNS.test(packageDetails.unit ?? ""));
  const normalizedName = normalizeIngredientName(prepared.name);

  return {
    normalizedName,
    quantity,
    unit: packageDetails.unit,
    brand: input.brand !== undefined ? input.brand : branded.brand,
    modifiers: input.modifiers ?? prepared.modifiers,
    packageQuantity: input.packageQuantity !== undefined ? input.packageQuantity : packageDetails.packageQuantity,
    packageUnit: input.packageUnit !== undefined ? input.packageUnit : packageDetails.packageUnit,
  };
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
  const normalizedName = parseIngredientDetails(countStripped.name, {
    unit,
  }).normalizedName;
  const shouldAppendUnit =
    displayCountUnits.has(normalizedUnit) &&
    !displayCountUnits.has(normalizedName.split(" ").at(-1) ?? "");

  let displayName =
    prepStripped.changed || countStripped.changed || normalizedName !== normalizeIngredientName(originalDisplayName)
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
