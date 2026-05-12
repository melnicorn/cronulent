import { getSessionToken } from '../../lib/session'
import { redirect } from 'next/navigation'
import { LoginForm } from '../../components/login-form'

export default async function LoginPage() {
  const token = await getSessionToken()
  if (token) redirect('/')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border border-border bg-card shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cronulent</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage your scheduled tasks</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
