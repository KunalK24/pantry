import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261001000000_add_weekly_plans_and_grocery_list/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("GroceryItem pantry relation", () => {
  it("keeps grocery items and clears their pantry reference when a pantry item is deleted", () => {
    expect(schema).toMatch(
      /pantryItem\s+PantryItem\?\s+@relation\([^\n]+onDelete: SetNull\)/u,
    );
    expect(migration).toContain(
      '"GroceryItem_pantryItemId_fkey" FOREIGN KEY ("pantryItemId") ' +
        'REFERENCES "PantryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
  });
});
