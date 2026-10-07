import { weekStartSchema, weeklyPlanInputSchema } from '@/schemas/weekly-plan'
import { requireAuth } from '@/lib/auth'
import {
    getWeeklyPlan,
    saveWeeklyPlan,
    WeeklyPlanReferenceError,
} from '@/services/weekly-plan-service'

type WeeklyPlanRouteContext = {
    params: Promise<{
        weekStart: string
    }>
}

function internalServerErrorResponse(error: unknown) {
    console.error(error)

    return Response.json(
        { error: 'Internal Server Error' },
        { status: 500 },
    )
}

async function parseWeekStart(context: WeeklyPlanRouteContext) {
    const { weekStart } = await context.params
    return weekStartSchema.safeParse(weekStart)
}

export async function GET(_request: Request, context: WeeklyPlanRouteContext) {
    const auth = await requireAuth(_request)

    if (auth.response) {
        return auth.response
    }

    const weekStartResult = await parseWeekStart(context)

    if (!weekStartResult.success) {
        return Response.json(
            { error: 'Invalid week start' },
            { status: 400 },
        )
    }

    try {
        const plan = await getWeeklyPlan(auth.user.id, weekStartResult.data)
        return Response.json({ plan })
    } catch (error) {
        return internalServerErrorResponse(error)
    }
}

export async function PUT(request: Request, context: WeeklyPlanRouteContext) {
    const auth = await requireAuth(request)

    if (auth.response) {
        return auth.response
    }

    const weekStartResult = await parseWeekStart(context)

    if (!weekStartResult.success) {
        return Response.json(
            { error: 'Invalid week start' },
            { status: 400 },
        )
    }

    let input: unknown

    try {
        input = await request.json()
    } catch {
        return Response.json(
            { error: 'Malformed JSON' },
            { status: 400 },
        )
    }

    const inputResult = weeklyPlanInputSchema.safeParse(input)

    if (!inputResult.success) {
        return Response.json(
            {
                error: 'Invalid weekly plan',
                details: inputResult.error.flatten(),
            },
            { status: 400 },
        )
    }

    try {
        const plan = await saveWeeklyPlan(auth.user.id, weekStartResult.data, inputResult.data)
        return Response.json({ plan })
    } catch (error) {
        if (error instanceof WeeklyPlanReferenceError) {
            return Response.json(
                { error: 'Weekly plan references an unknown recipe' },
                { status: 400 },
            )
        }

        return internalServerErrorResponse(error)
    }
}
