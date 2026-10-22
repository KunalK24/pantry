import { describe, expect, it } from 'vitest'

import { mapScrapedRecipe, PythonRecipeParseError } from './python-parser'

describe('Python recipe scraper mapping', () => {
    const scraped = {
        name: 'Bread',
        instructions: ['Mix', 'Bake'],
        ingredients: ['1 1/2 cups flour', '2 tbsp sugar', '¼ tsp salt'],
    }

    it('preserves explicit ingredient quantities and steps', () => {
        expect(mapScrapedRecipe(scraped)).toEqual({
            name: 'Bread',
            instructions: 'Mix\nBake',
            ingredients: [
                { name: 'flour', quantity: '1 1/2', unit: 'cups' },
                { name: 'sugar', quantity: '2', unit: 'tbsp' },
                { name: 'salt', quantity: '¼', unit: 'tsp' },
            ],
        })
    })

    it('treats missing quantity as incomplete instead of inventing one', () => {
        expect(() => mapScrapedRecipe({ ...scraped, ingredients: ['salt'] })).toThrowError(PythonRecipeParseError)
    })

    it('rejects non-recipes and invalid Pantry drafts', () => {
        expect(() => mapScrapedRecipe({ ...scraped, instructions: [] })).toThrowError(PythonRecipeParseError)
        expect(() => mapScrapedRecipe({ ...scraped, ingredients: ['1 cup flour', '2 cups flour'] })).toThrowError(PythonRecipeParseError)
    })
})
