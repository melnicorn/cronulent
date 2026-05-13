import 'server-only'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'cronulent_token'

export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE_NAME)?.value ?? null
}

export async function setSessionToken(token: string, expiresAt: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === 'true',
    sameSite: 'lax',
    expires: new Date(expiresAt),
    path: '/',
  })
}

export async function clearSessionToken(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_NAME)
}
