import 'dotenv/config'

import { pathToFileURL } from 'node:url'

import type { Prisma } from '@/generated/prisma/client'
import { normalizeIngredientName } from '@/lib/ingredient-normalization'

export type PantryItemNormalizationSource = {
    id: string
    name: string
    normalizedName: string
    quantity: string | null
    unit: string | null
}

export type PantryItemNormalizationUpdate = {
    id: string
    normalizedName: string
    previousNormalizedName: string
}

export type PantryItemNormalizationCollision = {
    normalizedName: string
    items: PantryItemNormalizationSource[]
}

export type PantryItemNormalizationPlan = {
    updates: PantryItemNormalizationUpdate[]
    collisions: PantryItemNormalizationCollision[]
}

export class PantryItemNormalizationCollisionError extends Error {
    constructor(public readonly plan: PantryItemNormalizationPlan) {
        super('Resolve pantry item collisions before applying the backfill.')
        this.name = 'PantryItemNormalizationCollisionError'
    }
}

export function createPantryItemNormalizationPlan(
    items: PantryItemNormalizationSource[],
): PantryItemNormalizationPlan {
    const itemsByCanonicalName = new Map<string, PantryItemNormalizationSource[]>()

    for (const item of items) {
        const canonicalName = normalizeIngredientName(item.name)
        const matchingItems = itemsByCanonicalName.get(canonicalName) ?? []

        matchingItems.push(item)
        itemsByCanonicalName.set(canonicalName, matchingItems)
    }

    const collisions = [...itemsByCanonicalName]
        .filter(([, matchingItems]) => matchingItems.length > 1)
        .map(([normalizedName, matchingItems]) => ({
            normalizedName,
            items: matchingItems.slice().sort((left, right) => left.id.localeCompare(right.id)),
        }))
        .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName))

    const updates = items
        .map((item) => ({
            id: item.id,
            normalizedName: normalizeIngredientName(item.name),
            previousNormalizedName: item.normalizedName,
        }))
        .filter((item) => item.normalizedName !== item.previousNormalizedName)
        .sort((left, right) => left.id.localeCompare(right.id))

    return { updates, collisions }
}

export function shouldApplyPantryItemNormalization(args: string[]) {
    const unexpectedArgs = args.filter((argument) => argument !== '--apply')

    if (unexpectedArgs.length > 0) {
        throw new Error(`Unexpected argument: ${unexpectedArgs[0]}`)
    }

    return args.includes('--apply')
}

function reportPlan(plan: PantryItemNormalizationPlan, apply: boolean) {
    console.log(`Mode: ${apply ? 'apply' : 'dry run'}`)
    console.log(`Pantry items requiring updates: ${plan.updates.length}`)

    for (const update of plan.updates) {
        console.log(
            `  ${update.id}: ${JSON.stringify(update.previousNormalizedName)} -> ${JSON.stringify(update.normalizedName)}`,
        )
    }

    if (plan.collisions.length === 0) {
        return
    }

    console.error(`Canonical-name collisions: ${plan.collisions.length}`)

    for (const collision of plan.collisions) {
        console.error(`  ${JSON.stringify(collision.normalizedName)}`)

        for (const item of collision.items) {
            console.error(
                `    id=${item.id} name=${JSON.stringify(item.name)} quantity=${JSON.stringify(item.quantity)} unit=${JSON.stringify(item.unit)}`,
            )
        }
    }
}

function createTemporaryNames(
    items: PantryItemNormalizationSource[],
    updates: PantryItemNormalizationUpdate[],
) {
    const reservedNames = new Set([
        ...items.map((item) => item.normalizedName),
        ...items.map((item) => normalizeIngredientName(item.name)),
    ])

    return new Map(updates.map((update, index) => {
        let temporaryName = `__pantry_normalization_${index}_${update.id}`

        while (reservedNames.has(temporaryName)) {
            temporaryName += '_'
        }

        reservedNames.add(temporaryName)
        return [update.id, temporaryName]
    }))
}

export async function applyPantryItemNormalization(
    transaction: Prisma.TransactionClient,
): Promise<PantryItemNormalizationPlan> {
    const items = await transaction.$queryRaw<PantryItemNormalizationSource[]>`
        SELECT "id", "name", "normalizedName", "quantity", "unit"
        FROM "PantryItem"
        ORDER BY "id"
        FOR UPDATE
    `
    const plan = createPantryItemNormalizationPlan(items)

    if (plan.collisions.length > 0) {
        throw new PantryItemNormalizationCollisionError(plan)
    }

    const temporaryNames = createTemporaryNames(items, plan.updates)

    for (const update of plan.updates) {
        await transaction.pantryItem.update({
            where: { id: update.id },
            data: {
                normalizedName: temporaryNames.get(update.id)!,
            },
        })
    }

    for (const update of plan.updates) {
        await transaction.pantryItem.update({
            where: { id: update.id },
            data: { normalizedName: update.normalizedName },
        })
    }

    return plan
}

async function run() {
    const apply = shouldApplyPantryItemNormalization(process.argv.slice(2))
    const { prisma } = await import('@/lib/prisma')

    try {
        if (!apply) {
            const items = await prisma.pantryItem.findMany({
                select: {
                    id: true,
                    name: true,
                    normalizedName: true,
                    quantity: true,
                    unit: true,
                },
            })
            const plan = createPantryItemNormalizationPlan(items)

            reportPlan(plan, false)

            if (plan.collisions.length > 0) {
                throw new PantryItemNormalizationCollisionError(plan)
            }

            console.log('No changes written. Re-run with --apply to update the database.')
            return
        }

        let plan: PantryItemNormalizationPlan

        try {
            plan = await prisma.$transaction(applyPantryItemNormalization)
        } catch (error) {
            if (error instanceof PantryItemNormalizationCollisionError) {
                reportPlan(error.plan, true)
            }

            throw error
        }

        reportPlan(plan, true)

        console.log(plan.updates.length === 0
            ? 'No pantry items need normalization.'
            : `Updated ${plan.updates.length} pantry items.`)
    } finally {
        await prisma.$disconnect()
    }
}

const entryPoint = process.argv[1]

if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
    run().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error)
        process.exitCode = 1
    })
}
