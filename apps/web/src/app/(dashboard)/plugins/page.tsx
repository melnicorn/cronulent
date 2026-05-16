import { redirect } from 'next/navigation'
import { getTrpcClient } from '../../../lib/trpc'
import { PluginList } from '../../../components/plugin-list'

export default async function PluginsPage() {
  const client = await getTrpcClient()
  let plugins
  try {
    const result = await client.plugins.list.query()
    plugins = result.plugins
  } catch (err: unknown) {
    const code = (err as { data?: { code?: string } })?.data?.code
    if (code === 'UNAUTHORIZED') redirect('/api/auth/signout')
    throw err
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Plugins</h1>
      <PluginList plugins={plugins} />
    </div>
  )
}
