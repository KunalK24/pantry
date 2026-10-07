import { signUpSchema } from '@/schemas/auth'
import {
    EmailAlreadyRegisteredError,
    signUp,
} from '@/services/auth-service'
import { sessionCookie } from '@/lib/auth'

export async function POST(request: Request) {
    let input: unknown

    try {
        input = await request.json()
    } catch {
        return Response.json({ error: 'Malformed JSON' }, { status: 400 })
    }

    const result = signUpSchema.safeParse(input)

    if (!result.success) {
        return Response.json(
            {
                error: 'Invalid sign-up',
                details: result.error.flatten(),
            },
            { status: 400 },
        )
    }

    try {
        const { user, session } = await signUp(result.data)

        return Response.json(
            { user },
            {
                status: 201,
                headers: {
                    'Set-Cookie': sessionCookie(session),
                },
            },
        )
    } catch (error) {
        if (error instanceof EmailAlreadyRegisteredError) {
            return Response.json(
                { error: 'Email already registered' },
                { status: 409 },
            )
        }

        console.error(error)
        return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
