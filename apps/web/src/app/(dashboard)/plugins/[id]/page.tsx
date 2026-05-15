import { notFound, redirect } from 'next/navigation'
import { getTrpcClient } from '../../../../lib/trpc'
import { PluginConfigForm } from '../../../../components/plugin-config-form'
import { LinkButton } from '../../../../components/link-button'

export default async function PluginConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await getTrpcClient()

  let pluginData: Awaited<ReturnType<typeof client.plugins.list.query>>['plugins'][number] | undefined
  let configFields: Awaited<ReturnType<typeof client.plugins.getConfig.query>>['fields']

  try {
    const { plugins } = await client.plugins.list.query()
    pluginData = plugins.find(p => p.id === id)
    if (!pluginData) notFound()

    const { fields } = await client.plugins.getConfig.query({ pluginId: id })
    configFields = fields
  } catch (err: unknown) {
    const code = (err as { data?: { code?: string } })?.data?.code
    if (code === 'UNAUTHORIZED') redirect('/api/auth/signout')
    if (code === 'NOT_FOUND') notFound()
    throw err
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <LinkButton href="/plugins" variant="ghost" size="sm">← Plugins</LinkButton>
        <h1 className="text-xl font-semibold text-foreground">{pluginData!.name}</h1>
      </div>
      <p className="text-sm text-muted-foreground">{pluginData!.description}</p>
      <PluginConfigForm
        pluginId={id}
        manifest={pluginData!}
        fields={configFields!}
        enabled={pluginData!.enabled}
      />
    </div>
  )
}
