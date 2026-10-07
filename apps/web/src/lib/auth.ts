import {
    getSessionUser,
    SESSION_MAX_AGE_SECONDS,
    type CreatedSession,
    type PublicUser,
} from '@/services/auth-service'

export const SESSION_COOKIE_NAME = 'pantry_session'

function cookieOptions(maxAgeSeconds: number) {
    const options = [
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAgeSeconds}`,
    ]

    if (process.env.NODE_ENV === 'production') {
        options.push('Secure')
    }

    return options
}

function serializeCookie(value: string, maxAgeSeconds: number) {
    return [
        `${SESSION_COOKIE_NAME}=${value}`,
        ...cookieOptions(maxAgeSeconds),
    ].join('; ')
}

export function sessionCookie(session: CreatedSession) {
    return serializeCookie(session.token, SESSION_MAX_AGE_SECONDS)
}

export function clearSessionCookie() {
    return serializeCookie('', 0)
}

export function getSessionToken(request: Request) {
    const cookieHeader = request.headers.get('cookie')

    if (!cookieHeader) {
        return null
    }

    const cookies = cookieHeader.split(';')

    for (const cookie of cookies) {
        const [rawName, ...rawValue] = cookie.trim().split('=')

        if (rawName === SESSION_COOKIE_NAME) {
            const value = rawValue.join('=')
            return value || null
        }
    }

    return null
}

export async function getAuthenticatedUser(request: Request): Promise<PublicUser | null> {
    const token = getSessionToken(request)

    if (!token) {
        return null
    }

    return getSessionUser(token)
}

export async function requireAuth(request: Request) {
    const user = await getAuthenticatedUser(request)

    if (!user) {
        return {
            user: null,
            response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
        }
    }

    return {
        user,
        response: null,
    }
}
