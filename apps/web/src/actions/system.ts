'use server'

import { redirect } from 'next/navigation'
import { getTrpcClient } from '../lib/trpc'
import { setSessionToken } from '../lib/session'

export async function initializeAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = formData.get('password')
  const confirm = formData.get('confirm')

  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters'
  if (password !== confirm) return 'Passwords do not match'

  try {
    const client = await getTrpcClient()
    await client.system.initialize.mutate({ password })
    const result = await client.auth.login.mutate({ password })
    await setSessionToken(result.token, result.expiresAt)
  } catch (err) {
    return err instanceof Error ? err.message : 'Setup failed'
  }

  redirect('/')
}
