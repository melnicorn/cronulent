'use client'

import { useActionState, useState, useEffect } from 'react'
import { initializeAction } from '../actions/system'
import { Autocomplete, EmptyState, Label, ListBox, SearchField, TextField, Input, Button, useFilter } from '@heroui/react'
import type { Key } from '@heroui/react'

const allTimezones: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return []
  }
})()

export function SetupForm({ serverTimezone }: { serverTimezone: string }) {
  const [error, action, isPending] = useActionState(initializeAction, null)
  const [timezone, setTimezone] = useState('')
  const { contains } = useFilter({ sensitivity: 'base' })

  useEffect(() => {
    setTimezone(serverTimezone)
  }, [serverTimezone])

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
      <div className="space-y-1.5">
        <Autocomplete
          className="w-full"
          value={timezone || null}
          onChange={(key: Key | Key[] | null) => {
            const val = Array.isArray(key) ? key[0] : key
            if (typeof val === 'string') setTimezone(val)
          }}
        >
          <Label className="block text-sm text-muted-foreground">Timezone</Label>
          <Autocomplete.Trigger>
            <Autocomplete.Value />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover>
            <Autocomplete.Filter filter={contains}>
              <SearchField name="search" variant="secondary" aria-label="Search timezones">
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search timezones…" />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <ListBox renderEmptyState={() => <EmptyState>No results found</EmptyState>}>
                {allTimezones.map(tz => (
                  <ListBox.Item key={tz} id={tz} textValue={tz}>
                    {tz}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
        <p className="text-xs text-muted-foreground">Detected from server — change if incorrect</p>
      </div>
      <input type="hidden" name="timezone" value={timezone} />
      <Button type="submit" isDisabled={isPending} isPending={isPending} fullWidth>
        {isPending ? 'Setting up...' : 'Set password'}
      </Button>
    </form>
  )
}
