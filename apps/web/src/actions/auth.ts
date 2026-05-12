'use server'

import { redirect } from 'next/navigation'
import { getTrpcClient } from '../lib/trpc'
import { setSessionToken, clearSessionToken } from '../lib/session'

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = formData.get('password')
  if (typeof password !== 'string' || !password) return 'Password required'

  try {
    const client = await getTrpcClient()
    const result = await client.auth.login.mutate({ password })
    await setSessionToken(result.token, result.expiresAt)
  } catch {
    return 'Invalid password'
  }

  redirect('/')
}

export async function logoutAction() {
  const client = await getTrpcClient()
  await client.auth.logout.mutate().catch(() => {})
  await clearSessionToken()
  redirect('/login')
}
