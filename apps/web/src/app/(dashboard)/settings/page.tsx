import { redirect } from 'next/navigation'
import { getTrpcClient } from '../../../lib/trpc'
import { SettingsForm } from '../../../components/settings-form'

export default async function SettingsPage() {
  const client = await getTrpcClient()
  let timezone: string
  try {
    const settings = await client.system.getSettings.query()
    timezone = settings.timezone
  } catch (err: unknown) {
    const code = (err as { data?: { code?: string } })?.data?.code
    if (code === 'UNAUTHORIZED') redirect('/api/auth/signout')
    throw err
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      <SettingsForm currentTimezone={timezone} />
    </div>
  )
}
