'use client'

import { useActionState } from 'react'
import { initializeAction } from '../actions/system'

export function SetupForm() {
  const [error, action, isPending] = useActionState(initializeAction, null)

  return (
    <form action={action} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="At least 8 characters"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-foreground">Confirm password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          required
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Repeat password"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isPending ? 'Setting up...' : 'Set password'}
      </button>
    </form>
  )
}
