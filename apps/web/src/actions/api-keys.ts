'use server'

import { revalidatePath } from 'next/cache'
import { createApiKey, regenerateApiKey, revokeApiKey } from '../lib/api-keys'

// createKeyAction and regenerateKeyAction return the plaintext key. It is shown
// to the user once and never persisted, so it must not be logged here or by
// callers.

export async function createKeyAction(label: string): Promise<{ key: string }> {
  const { key } = await createApiKey(label)
  revalidatePath('/api-keys')
  return { key }
}

export async function regenerateKeyAction(id: string): Promise<{ key: string } | null> {
  const result = await regenerateApiKey(id)
  revalidatePath('/api-keys')
  return result
}

export async function revokeKeyAction(id: string): Promise<void> {
  await revokeApiKey(id)
  revalidatePath('/api-keys')
}
