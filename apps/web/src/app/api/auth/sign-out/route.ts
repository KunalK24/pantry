import { clearSessionCookie, getSessionToken } from '@/lib/auth'
import { signOut } from '@/services/auth-service'

export async function POST(request: Request) {
    try {
        const token = getSessionToken(request)

        if (token) {
            await signOut(token)
        }

        return new Response(null, {
            status: 204,
            headers: {
                'Set-Cookie': clearSessionCookie(),
            },
        })
    } catch (error) {
        console.error(error)
        return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
