'use client'

import { useActionState } from 'react'
import { initializeAction } from '../actions/system'
import { TextField, Label, Input, Button } from '@heroui/react'

export function SetupForm() {
  const [error, action, isPending] = useActionState(initializeAction, null)

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
          minLength={8}
          autoFocus
          placeholder="At least 8 characters"
        />
      </TextField>
      <TextField isRequired fullWidth>
        <Label>Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          placeholder="Repeat password"
        />
      </TextField>
      <Button type="submit" isDisabled={isPending} isPending={isPending} fullWidth>
        {isPending ? 'Setting up...' : 'Set password'}
      </Button>
    </form>
  )
}
