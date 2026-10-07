import { NextResponse, type NextRequest } from 'next/server'

import { clearSessionCookie, getSessionToken } from '@/lib/auth'
import { getSessionUser } from '@/services/auth-service'

const publicPaths = new Set([
    '/sign-in',
    '/sign-up',
])

function isPublicPath(pathname: string) {
    return publicPaths.has(pathname)
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    const token = getSessionToken(request)

    return handlePageAuth(request, pathname, token)
}

async function getUserForToken(token: string | null) {
    if (!token) {
        return null
    }

    try {
        return await getSessionUser(token)
    } catch (error) {
        console.error(error)
        return null
    }
}

function redirectWithClearedSession(request: NextRequest, pathname: string) {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''

    const response = NextResponse.redirect(url)
    response.headers.set('Set-Cookie', clearSessionCookie())

    return response
}

async function handlePageAuth(request: NextRequest, pathname: string, token: string | null) {
    const user = await getUserForToken(token)

    if (!user && !isPublicPath(pathname)) {
        if (token) {
            return redirectWithClearedSession(request, '/sign-in')
        }

        const url = request.nextUrl.clone()
        url.pathname = '/sign-in'
        url.search = ''

        return NextResponse.redirect(url)
    }

    if (user && isPublicPath(pathname)) {
        const url = request.nextUrl.clone()
        url.pathname = '/recipes'
        url.search = ''

        return NextResponse.redirect(url)
    }

    if (!user && token) {
        const response = NextResponse.next()
        response.headers.set('Set-Cookie', clearSessionCookie())
        return response
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/',
        '/recipes/:path*',
        '/meal-planner/:path*',
        '/pantry/:path*',
        '/grocery-list/:path*',
        '/sign-in',
        '/sign-up',
    ],
}
