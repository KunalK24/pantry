import { z } from "zod";

import { normalizePackageUnit } from "@/lib/ingredient-normalization";

const packageUnitSchema = z
  .string()
  .trim()
  .max(30)
  .transform(normalizePackageUnit)
  .pipe(z.enum(["oz", "g", "lb", "kg", "fl oz", "ml", "l"]));

export const ingredientDetailsFields = {
  brand: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || null)
    .nullable()
    .optional(),
  modifiers: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  packageQuantity: z
    .string()
    .trim()
    .max(20)
    .regex(/^\d+(?:\.\d+)?$/u, "Expected a positive decimal amount")
    .refine((value) => Number(value) > 0, "Expected a positive amount")
    .nullable()
    .optional(),
  packageUnit: packageUnitSchema.nullable().optional(),
};

export function hasValidPackageCorrection(input: {
  packageQuantity?: string | null;
  packageUnit?: string | null;
}): boolean {
  return (
    (input.packageQuantity === undefined && input.packageUnit === undefined) ||
    (input.packageQuantity === null && input.packageUnit === null) ||
    (typeof input.packageQuantity === "string" && typeof input.packageUnit === "string")
  );
}
