'use client'

import { useActionState } from 'react'
import { loginAction } from '../actions/auth'

export function LoginForm() {
  const [error, action, isPending] = useActionState(loginAction, null)

  return (
    <form action={action} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Enter password"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isPending ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  )
}
