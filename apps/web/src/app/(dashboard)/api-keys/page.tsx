import { listApiKeys } from '../../../lib/api-keys'
import { ApiKeyManager } from '../../../components/api-key-manager'

export const dynamic = 'force-dynamic'

export default async function ApiKeysPage() {
  const keys = await listApiKeys()
  const serviceTokenConfigured = Boolean(process.env.CRONULENT_SERVICE_TOKEN)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-foreground">API Keys</h1>
      <ApiKeyManager keys={keys} serviceTokenConfigured={serviceTokenConfigured} />
    </div>
  )
}
