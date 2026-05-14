import { redirect } from 'next/navigation'
import { getTrpcClient } from '../../lib/trpc'
import { SetupForm } from '../../components/setup-form'

export default async function SetupPage() {
  const client = await getTrpcClient()
  const { initialized } = await client.system.status.query()
  if (initialized) redirect('/login')

  const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border border-border bg-card shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Welcome to Cronulent</h1>
          <p className="text-sm text-muted-foreground mt-1">Create an admin password to get started.</p>
        </div>
        <SetupForm serverTimezone={serverTimezone} />
      </div>
    </div>
  )
}
