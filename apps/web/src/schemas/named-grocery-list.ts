import { z } from "zod";

export const groceryListNameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export const groceryListRenameSchema = groceryListNameSchema.extend({
  expectedRevision: z.number().int().nonnegative(),
});

export const groceryListIdSchema = z.cuid();
