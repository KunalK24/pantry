export type PantryLocation = "Fridge" | "Pantry" | "Cupboard" | "Freezer" | "Spice Cabinet";

export const pantryLocations: PantryLocation[] = ["Fridge", "Pantry", "Cupboard", "Freezer", "Spice Cabinet"];

export type PantryItem = {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  brand: string | null;
  modifiers: string[];
  packageQuantity: string | null;
  packageUnit: string | null;
  location: string | null;
  expiresOn: string | null;
};

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

export function isPantryItem(value: unknown): value is PantryItem {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || typeof value.id !== "string") return false;
  if (!("name" in value) || typeof value.name !== "string") return false;
  if (!("quantity" in value) || !isNullableString(value.quantity)) return false;
  if (!("unit" in value) || !isNullableString(value.unit)) return false;
  if (!("brand" in value) || !isNullableString(value.brand)) return false;
  if (!("modifiers" in value) || !Array.isArray(value.modifiers) || !value.modifiers.every((part) => typeof part === "string")) return false;
  if (!("packageQuantity" in value) || !isNullableString(value.packageQuantity)) return false;
  if (!("packageUnit" in value) || !isNullableString(value.packageUnit)) return false;
  if (!("location" in value) || !isNullableString(value.location)) return false;
  return "expiresOn" in value && isNullableString(value.expiresOn);
}

export function isPantryResponse(value: unknown): value is { items: PantryItem[] } {
  return typeof value === "object" && value !== null && "items" in value &&
    Array.isArray(value.items) && value.items.every(isPantryItem);
}

export function isValidPantryDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
