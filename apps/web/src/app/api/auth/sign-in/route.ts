import { sessionCookie } from '@/lib/auth'
import { signInSchema } from '@/schemas/auth'
import {
    InvalidCredentialsError,
    signIn,
} from '@/services/auth-service'

export async function POST(request: Request) {
    let input: unknown

    try {
        input = await request.json()
    } catch {
        return Response.json({ error: 'Malformed JSON' }, { status: 400 })
    }

    const result = signInSchema.safeParse(input)

    if (!result.success) {
        return Response.json(
            {
                error: 'Invalid sign-in',
                details: result.error.flatten(),
            },
            { status: 400 },
        )
    }

    try {
        const { user, session } = await signIn(result.data)

        return Response.json(
            { user },
            {
                status: 200,
                headers: {
                    'Set-Cookie': sessionCookie(session),
                },
            },
        )
    } catch (error) {
        if (error instanceof InvalidCredentialsError) {
            return Response.json(
                { error: 'Invalid email or password' },
                { status: 401 },
            )
        }

        console.error(error)
        return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
