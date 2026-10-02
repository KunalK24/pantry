const ingredientAliases: ReadonlyMap<string, string> = new Map([
    ['scallion', 'green onion'],
    ['scallions', 'green onion'],
    ['green onions', 'green onion'],
])

export function normalizeIngredientName(name: string): string {
    const normalizedName = name.trim().replace(/\s+/gu, ' ').toLowerCase()

    return ingredientAliases.get(normalizedName) ?? normalizedName
}
