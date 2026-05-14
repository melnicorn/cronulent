'use client'

import { useActionState } from 'react'
import { loginAction } from '../actions/auth'
import { TextField, Label, Input, Button } from '@heroui/react'

export function LoginForm() {
  const [error, action, isPending] = useActionState(loginAction, null)

  return (
    <form action={action} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
      )}
      <TextField isRequired fullWidth>
        <Label>Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoFocus
          placeholder="Enter password"
        />
      </TextField>
      <Button type="submit" isDisabled={isPending} isPending={isPending} fullWidth>
        {isPending ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  )
}
