import { describe, expect, it } from 'vitest'

import { normalizeIngredientName } from '@/lib/ingredient-normalization'

describe('normalizeIngredientName', () => {
    it('normalizes casing and whitespace', () => {
        expect(normalizeIngredientName('  Olive\t  OIL\n')).toBe('olive oil')
    })

    it.each(['scallion', 'Scallions', ' green   onions '])(
        'maps %j to the canonical green onion name',
        (name) => {
            expect(normalizeIngredientName(name)).toBe('green onion')
        },
    )

    it('keeps the canonical name unchanged', () => {
        expect(normalizeIngredientName('Green Onion')).toBe('green onion')
    })

    it.each([
        ['constructor', 'constructor'],
        ['toString', 'tostring'],
        ['__proto__', '__proto__'],
        ['fresh scallions', 'fresh scallions'],
        ['green-onion', 'green-onion'],
        ['scallion, chopped', 'scallion, chopped'],
        ['spring onion', 'spring onion'],
        ['tomatoes', 'tomatoes'],
    ])('does not infer a rule for %j', (name, expected) => {
        expect(normalizeIngredientName(name)).toBe(expected)
    })
})
