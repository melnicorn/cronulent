'use server'

import { revalidatePath } from 'next/cache'
import { getTrpcClient } from '../lib/trpc'

export async function setPluginEnabledAction(pluginId: string, enabled: boolean): Promise<void> {
  const client = await getTrpcClient()
  await client.plugins.setEnabled.mutate({ pluginId, enabled })
  revalidatePath('/plugins')
}

export async function updatePluginConfigAction(
  pluginId: string,
  config: Record<string, string>,
): Promise<void> {
  const client = await getTrpcClient()
  await client.plugins.updateConfig.mutate({ pluginId, config })
  revalidatePath(`/plugins/${pluginId}`)
}
