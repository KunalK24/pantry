import { getAuthenticatedUser } from '@/lib/auth'

export async function GET(request: Request) {
    try {
        const user = await getAuthenticatedUser(request)

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        return Response.json({ user })
    } catch (error) {
        console.error(error)
        return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
