'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTrpcClient } from '../lib/trpc'
import { setSessionToken } from '../lib/session'

export async function initializeAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = formData.get('password')
  const confirm = formData.get('confirm')
  const timezone = formData.get('timezone')

  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters'
  if (password !== confirm) return 'Passwords do not match'

  try {
    const client = await getTrpcClient()
    await client.system.initialize.mutate({
      password,
      timezone: typeof timezone === 'string' && timezone ? timezone : undefined,
    })
    const result = await client.auth.login.mutate({ password })
    await setSessionToken(result.token, result.expiresAt)
  } catch (err) {
    return err instanceof Error ? err.message : 'Setup failed'
  }

  redirect('/')
}

export async function updateSettingsAction(input: { timezone: string; maxHistoryItems: number }): Promise<void> {
  const client = await getTrpcClient()
  await client.system.updateSettings.mutate(input)
  revalidatePath('/settings')
}
