import { afterEach, describe, expect, it, vi } from 'vitest'

const { getSessionUserMock } = vi.hoisted(() => ({
    getSessionUserMock: vi.fn(),
}))

vi.mock('@/services/auth-service', () => ({
    getSessionUser: getSessionUserMock,
    SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 30,
}))

import {
    clearSessionCookie,
    getSessionToken,
    sessionCookie,
    SESSION_COOKIE_NAME,
} from '@/lib/auth'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

describe('auth cookie helpers', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('serializes session cookies for local development without Secure', () => {
        vi.stubEnv('NODE_ENV', 'test')

        const cookie = sessionCookie({
            token: 'raw-token',
            expiresAt: new Date('2026-11-01T00:00:00.000Z'),
        })

        expect(cookie).toContain(`${SESSION_COOKIE_NAME}=raw-token`)
        expect(cookie).toContain('Path=/')
        expect(cookie).toContain('HttpOnly')
        expect(cookie).toContain('SameSite=Lax')
        expect(cookie).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`)
        expect(cookie).not.toContain('Secure')
    })

    it('adds Secure to session cookies in production', () => {
        vi.stubEnv('NODE_ENV', 'production')

        expect(sessionCookie({
            token: 'raw-token',
            expiresAt: new Date('2026-11-01T00:00:00.000Z'),
        })).toContain('Secure')
    })

    it('clears the session cookie with Max-Age 0', () => {
        expect(clearSessionCookie()).toContain(`${SESSION_COOKIE_NAME}=`)
        expect(clearSessionCookie()).toContain('Max-Age=0')
    })

    it('extracts the session token from a cookie header', () => {
        const request = new Request('http://localhost:3000/api/auth/me', {
            headers: {
                cookie: 'theme=dark; pantry_session=raw-token=value; other=1',
            },
        })

        expect(getSessionToken(request)).toBe('raw-token=value')
    })
})
