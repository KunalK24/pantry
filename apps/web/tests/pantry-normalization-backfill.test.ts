import { describe, expect, it, vi } from 'vitest'

import type { Prisma } from '@/generated/prisma/client'
import {
    applyPantryItemNormalization,
    createPantryItemNormalizationPlan,
    PantryItemNormalizationCollisionError,
    shouldApplyPantryItemNormalization,
    type PantryItemNormalizationSource,
} from '../scripts/normalize-pantry-items'

function pantryItem(
    id: string,
    name: string,
    normalizedName: string,
    quantity: string | null = null,
    unit: string | null = null,
): PantryItemNormalizationSource {
    return { id, name, normalizedName, quantity, unit }
}

describe('pantry normalization backfill planning', () => {
    it('plans only canonical keys that need to change', () => {
        expect(createPantryItemNormalizationPlan([
            pantryItem('a', 'Scallions', 'scallions'),
            pantryItem('b', 'Olive Oil', 'olive oil'),
        ])).toEqual({
            updates: [{
                id: 'a',
                normalizedName: 'green onion',
                previousNormalizedName: 'scallions',
            }],
            collisions: [],
        })
    })

    it('reports canonical collisions with the source data needed to resolve them', () => {
        const scallions = pantryItem('b', 'Scallions', 'scallions', '2', 'bunches')
        const greenOnion = pantryItem('a', 'Green onion', 'green onion', '1/2', 'cup')
        const plan = createPantryItemNormalizationPlan([scallions, greenOnion])

        expect(plan.collisions).toEqual([{
            normalizedName: 'green onion',
            items: [greenOnion, scallions],
        }])
        expect(plan.updates).toEqual([{
            id: 'b',
            normalizedName: 'green onion',
            previousNormalizedName: 'scallions',
        }])
    })

    it('reports every alias-equivalent source row in a collision', () => {
        const items = [
            pantryItem('c', 'Green onions', 'green onions', '3', 'stalks'),
            pantryItem('a', 'Scallion', 'scallion', null, null),
            pantryItem('b', 'Green onion', 'green onion', '1', 'bunch'),
        ]

        expect(createPantryItemNormalizationPlan(items).collisions).toEqual([{
            normalizedName: 'green onion',
            items: [items[1], items[2], items[0]],
        }])
    })

    it('uses dry-run mode unless --apply is explicit', () => {
        expect(shouldApplyPantryItemNormalization([])).toBe(false)
        expect(shouldApplyPantryItemNormalization(['--apply'])).toBe(true)
        expect(() => shouldApplyPantryItemNormalization(['--force'])).toThrow(
            'Unexpected argument: --force',
        )
    })
})

describe('applyPantryItemNormalization', () => {
    function transactionWithRows(rows: PantryItemNormalizationSource[]) {
        const queryRaw = vi.fn().mockResolvedValue(rows)
        const update = vi.fn().mockResolvedValue(undefined)
        const transaction = {
            $queryRaw: queryRaw,
            pantryItem: { update },
        } as unknown as Prisma.TransactionClient

        return { queryRaw, transaction, update }
    }

    it('plans and writes from the current rows locked inside the transaction', async () => {
        const { queryRaw, transaction, update } = transactionWithRows([
            pantryItem('current', 'Scallions', 'scallions', '2', 'bunches'),
        ])

        await expect(applyPantryItemNormalization(transaction)).resolves.toEqual({
            updates: [{
                id: 'current',
                normalizedName: 'green onion',
                previousNormalizedName: 'scallions',
            }],
            collisions: [],
        })

        expect(queryRaw).toHaveBeenCalledOnce()
        const query = queryRaw.mock.calls[0][0] as TemplateStringsArray
        expect(query.join(' ')).toContain('FROM "PantryItem"')
        expect(query.join(' ')).toContain('FOR UPDATE')
        expect(update).toHaveBeenCalledTimes(2)
        expect(update).toHaveBeenLastCalledWith({
            where: { id: 'current' },
            data: { normalizedName: 'green onion' },
        })
    })

    it('writes every temporary key before assigning any final canonical key', async () => {
        const rows = [
            pantryItem('a', 'Scallion', 'legacy-scallion'),
            pantryItem('b', 'Olive Oil', 'legacy-olive-oil'),
        ]
        const { transaction, update } = transactionWithRows(rows)

        await applyPantryItemNormalization(transaction)

        const temporaryWrites = update.mock.calls.slice(0, rows.length)
        const finalWrites = update.mock.calls.slice(rows.length)
        const temporaryNames = temporaryWrites.map(
            ([operation]) => operation.data.normalizedName,
        )

        expect(new Set(temporaryNames).size).toBe(rows.length)
        expect(temporaryNames).not.toContain('legacy-scallion')
        expect(temporaryNames).not.toContain('legacy-olive-oil')
        expect(temporaryNames).not.toContain('green onion')
        expect(temporaryNames).not.toContain('olive oil')
        expect(temporaryWrites.map(([operation]) => operation.where.id)).toEqual(['a', 'b'])
        expect(finalWrites).toEqual([
            [{
                where: { id: 'a' },
                data: { normalizedName: 'green onion' },
            }],
            [{
                where: { id: 'b' },
                data: { normalizedName: 'olive oil' },
            }],
        ])
    })

    it('propagates a final-key write failure to the enclosing transaction', async () => {
        const { transaction, update } = transactionWithRows([
            pantryItem('a', 'Scallion', 'scallion'),
        ])
        const failure = new Error('final key conflict')

        update.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure)

        await expect(applyPantryItemNormalization(transaction)).rejects.toBe(failure)
    })

    it('does not write when the transaction-locked rows contain a collision', async () => {
        const { transaction, update } = transactionWithRows([
            pantryItem('a', 'Scallion', 'scallion', '2', 'bunches'),
            pantryItem('b', 'Green onion', 'green onion', '1', 'bunch'),
        ])

        await expect(applyPantryItemNormalization(transaction)).rejects
            .toBeInstanceOf(PantryItemNormalizationCollisionError)
        expect(update).not.toHaveBeenCalled()
    })
})
