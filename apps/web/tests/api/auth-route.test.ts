import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    EmailAlreadyRegisteredErrorMock,
    InvalidCredentialsErrorMock,
    clearSessionCookieMock,
    getAuthenticatedUserMock,
    getSessionTokenMock,
    sessionCookieMock,
    signInMock,
    signOutMock,
    signUpMock,
} = vi.hoisted(() => {
    class EmailAlreadyRegisteredErrorMock extends Error {}
    class InvalidCredentialsErrorMock extends Error {}

    return {
        EmailAlreadyRegisteredErrorMock,
        InvalidCredentialsErrorMock,
        clearSessionCookieMock: vi.fn(),
        getAuthenticatedUserMock: vi.fn(),
        getSessionTokenMock: vi.fn(),
        sessionCookieMock: vi.fn(),
        signInMock: vi.fn(),
        signOutMock: vi.fn(),
        signUpMock: vi.fn(),
    }
})

vi.mock('@/services/auth-service', () => ({
    EmailAlreadyRegisteredError: EmailAlreadyRegisteredErrorMock,
    InvalidCredentialsError: InvalidCredentialsErrorMock,
    signIn: signInMock,
    signOut: signOutMock,
    signUp: signUpMock,
}))

vi.mock('@/lib/auth', () => ({
    clearSessionCookie: clearSessionCookieMock,
    getAuthenticatedUser: getAuthenticatedUserMock,
    getSessionToken: getSessionTokenMock,
    sessionCookie: sessionCookieMock,
}))

import { GET as meGET } from '@/app/api/auth/me/route'
import { POST as signInPOST } from '@/app/api/auth/sign-in/route'
import { POST as signOutPOST } from '@/app/api/auth/sign-out/route'
import { POST as signUpPOST } from '@/app/api/auth/sign-up/route'

const user = {
    id: 'cm12345678901234567890123',
    email: 'cook@example.com',
}
const session = {
    token: 'raw-token',
    expiresAt: new Date('2026-11-01T00:00:00.000Z'),
}

function jsonRequest(path: string, body: unknown) {
    return new Request(`http://localhost:3000${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    sessionCookieMock.mockReturnValue('pantry_session=raw-token; Path=/; HttpOnly')
    clearSessionCookieMock.mockReturnValue('pantry_session=; Path=/; HttpOnly; Max-Age=0')
})

describe('POST /api/auth/sign-up', () => {
    it('creates a user, normalizes email, and sets a session cookie', async () => {
        signUpMock.mockResolvedValue({ user, session })

        const response = await signUpPOST(jsonRequest('/api/auth/sign-up', {
            email: ' Cook@Example.COM ',
            password: 'password123',
        }))

        expect(response.status).toBe(201)
        await expect(response.json()).resolves.toEqual({ user })
        expect(response.headers.get('set-cookie')).toBe('pantry_session=raw-token; Path=/; HttpOnly')
        expect(signUpMock).toHaveBeenCalledWith({
            email: user.email,
            password: 'password123',
        })
        expect(sessionCookieMock).toHaveBeenCalledWith(session)
    })

    it('returns 400 for malformed JSON', async () => {
        const response = await signUpPOST(new Request('http://localhost:3000/api/auth/sign-up', {
            method: 'POST',
            body: '{',
        }))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({ error: 'Malformed JSON' })
    })

    it('returns 400 for invalid sign-up input', async () => {
        const response = await signUpPOST(jsonRequest('/api/auth/sign-up', {
            email: 'bad',
            password: 'short',
        }))

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toMatchObject({ error: 'Invalid sign-up' })
        expect(signUpMock).not.toHaveBeenCalled()
    })

    it('returns 409 for duplicate emails', async () => {
        signUpMock.mockRejectedValue(new EmailAlreadyRegisteredErrorMock())

        const response = await signUpPOST(jsonRequest('/api/auth/sign-up', {
            email: user.email,
            password: 'password123',
        }))

        expect(response.status).toBe(409)
        await expect(response.json()).resolves.toEqual({ error: 'Email already registered' })
    })
})

describe('POST /api/auth/sign-in', () => {
    it('signs in and sets a session cookie', async () => {
        signInMock.mockResolvedValue({ user, session })

        const response = await signInPOST(jsonRequest('/api/auth/sign-in', {
            email: ' Cook@Example.COM ',
            password: 'password123',
        }))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ user })
        expect(response.headers.get('set-cookie')).toBe('pantry_session=raw-token; Path=/; HttpOnly')
        expect(signInMock).toHaveBeenCalledWith({
            email: user.email,
            password: 'password123',
        })
    })

    it('returns 401 with a generic credential error', async () => {
        signInMock.mockRejectedValue(new InvalidCredentialsErrorMock())

        const response = await signInPOST(jsonRequest('/api/auth/sign-in', {
            email: user.email,
            password: 'password123',
        }))

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({ error: 'Invalid email or password' })
    })
})

describe('POST /api/auth/sign-out', () => {
    it('deletes the session when a cookie exists and clears the cookie', async () => {
        getSessionTokenMock.mockReturnValue('raw-token')

        const response = await signOutPOST(new Request('http://localhost:3000/api/auth/sign-out', {
            method: 'POST',
            headers: {
                cookie: 'pantry_session=raw-token',
            },
        }))

        expect(response.status).toBe(204)
        expect(await response.text()).toBe('')
        expect(signOutMock).toHaveBeenCalledWith('raw-token')
        expect(response.headers.get('set-cookie')).toBe('pantry_session=; Path=/; HttpOnly; Max-Age=0')
    })

    it('is idempotent without a session cookie', async () => {
        getSessionTokenMock.mockReturnValue(null)

        const response = await signOutPOST(new Request('http://localhost:3000/api/auth/sign-out', {
            method: 'POST',
        }))

        expect(response.status).toBe(204)
        expect(signOutMock).not.toHaveBeenCalled()
    })
})

describe('GET /api/auth/me', () => {
    it('returns the authenticated user', async () => {
        getAuthenticatedUserMock.mockResolvedValue(user)

        const response = await meGET(new Request('http://localhost:3000/api/auth/me'))

        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ user })
    })

    it('returns 401 without a session', async () => {
        getAuthenticatedUserMock.mockResolvedValue(null)

        const response = await meGET(new Request('http://localhost:3000/api/auth/me'))

        expect(response.status).toBe(401)
        await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    })
})
